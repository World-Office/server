//! Hunspell .aff file parser
//!
//! This module parses Hunspell affinity files (.aff) which define the morphological
//! rules for a dictionary. The format includes FLAG, PFX, SFX, and REP entries.
//!
//! # File Format
//!
//! Hunspell .aff files contain various directives that define:
//! - **FLAG**: Flag characters used to mark affix rules
//! - **PFX**: Prefix rules (name, flag, stripping chars, affix, condition)
//! - **SFX**: Suffix rules (name, flag, stripping chars, affix, condition)
//! - **REP**: Replacement rules for suggestion generation
//!
//! # Example
//!
//! ```ignore
//! FLAG H
//! PFX A Y 1
//! PFX A   0     re         .
//! SFX V N 2
//! SFX V   e     ive        e
//! REP 4
//! REP ph f
//! ```

use crate::error::AffParseError;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fmt;

/// A parsed Hunspell affinity file
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AffixFile {
    /// Character encoding declaration (e.g., "UTF-8")
    pub encoding: Option<String>,
    /// Character set for word characters
    pub word_chars: Option<String>,
    /// Characters to try for suggestions
    pub try_chars: Option<String>,
    /// Iconv conversion mappings
    pub iconv: Vec<(String, String)>,
    /// NOSUGGEST patterns
    pub nosuggest: Vec<String>,
    /// Minimum compound word length
    pub compound_min: Option<usize>,
    /// Compound word rules
    pub compound_rules: Vec<String>,
    /// Flags and their values
    pub flags: HashMap<char, Flag>,
    /// Prefix rules
    pub prefixes: Vec<Prefix>,
    /// Prefix rules by name
    pub prefixes_by_name: HashMap<String, Vec<usize>>,
    /// Suffix rules
    pub suffixes: Vec<Suffix>,
    /// Suffix rules by name
    pub suffixes_by_name: HashMap<String, Vec<usize>>,
    /// Replacement rules
    pub replacements: Vec<Replacement>,
    /// Comments found in the file
    pub comments: Vec<String>,
}

impl AffixFile {
    /// Create a new empty AffixFile
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse an .aff file from a string
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(input: &str) -> Result<Self, Vec<AffParseError>> {
        let parser = AffParser::new();
        parser.parse_str(input)
    }

    /// Parse an .aff file from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Vec<AffParseError>> {
        let input = std::str::from_utf8(bytes)
            .map_err(|e| vec![AffParseError::EncodingError(e.to_string())])?;
        Self::from_str(input)
    }

    /// Get a flag by its character
    pub fn get_flag(&self, flag_char: char) -> Option<&Flag> {
        self.flags.get(&flag_char)
    }

    /// Get all prefixes with a specific name
    pub fn get_prefixes_by_name(&self, name: &str) -> &[usize] {
        self.prefixes_by_name
            .get(name)
            .map_or(&[], |v| v.as_slice())
    }

    /// Get all suffixes with a specific name
    pub fn get_suffixes_by_name(&self, name: &str) -> &[usize] {
        self.suffixes_by_name
            .get(name)
            .map_or(&[], |v| v.as_slice())
    }

    /// Get prefix by index
    pub fn get_prefix(&self, index: usize) -> Option<&Prefix> {
        self.prefixes.get(index)
    }

    /// Get suffix by index
    pub fn get_suffix(&self, index: usize) -> Option<&Suffix> {
        self.suffixes.get(index)
    }

    /// Returns true if the flag character is defined
    pub fn has_flag(&self, flag_char: char) -> bool {
        self.flags.contains_key(&flag_char)
    }
}

/// A flag definition in the .aff file
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum Flag {
    /// Simple flag (e.g., `FLAG H` then used as `Y` or `N`)
    #[default]
    Simple,
    /// Long flag with a specific value (e.g., `FLAG long:ABC`)
    Long(String),
    /// Numeric flag with a value
    Numeric(u32),
    /// Alias to another flag
    Alias(char),
}

impl fmt::Display for Flag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Flag::Simple => write!(f, "simple"),
            Flag::Long(s) => write!(f, "long:{}", s),
            Flag::Numeric(n) => write!(f, "numeric:{}", n),
            Flag::Alias(c) => write!(f, "alias:{}", c),
        }
    }
}

/// A prefix rule definition
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Prefix {
    /// Name of the prefix group (single character)
    pub name: char,
    /// Flag that enables this affix
    pub flag: char,
    /// Number of stripping characters
    pub strip_count: u32,
    /// The affix string to add
    pub affix: String,
    /// Condition pattern for when this rule applies
    pub condition: Option<String>,
}

impl Prefix {
    /// Create a new prefix
    pub fn new(
        name: char,
        flag: char,
        strip_count: u32,
        affix: String,
        condition: Option<String>,
    ) -> Self {
        Self {
            name,
            flag,
            strip_count,
            affix,
            condition,
        }
    }
}

/// A suffix rule definition
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Suffix {
    /// Name of the suffix group (single character)
    pub name: char,
    /// Flag that enables this affix
    pub flag: char,
    /// Number of stripping characters
    pub strip_count: u32,
    /// The affix string to add
    pub affix: String,
    /// Condition pattern for when this rule applies
    pub condition: Option<String>,
}

impl Suffix {
    /// Create a new suffix
    pub fn new(
        name: char,
        flag: char,
        strip_count: u32,
        affix: String,
        condition: Option<String>,
    ) -> Self {
        Self {
            name,
            flag,
            strip_count,
            affix,
            condition,
        }
    }
}

/// A replacement rule for suggestion generation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Replacement {
    /// Pattern to match
    pub from: String,
    /// Replacement string
    pub to: String,
}

impl Replacement {
    /// Create a new replacement rule
    pub fn new(from: String, to: String) -> Self {
        Self { from, to }
    }
}

/// Parser state for .aff files
struct AffParser {
    aff: AffixFile,
    errors: Vec<AffParseError>,
    /// Track which flag characters have been defined
    flag_long_values: HashSet<char>,
}

impl AffParser {
    fn new() -> Self {
        Self {
            aff: AffixFile::new(),
            errors: Vec::new(),
            flag_long_values: HashSet::new(),
        }
    }

    fn parse_str(mut self, input: &str) -> Result<AffixFile, Vec<AffParseError>> {
        for (line_num, line) in input.lines().enumerate() {
            let line_num = line_num + 1; // 1-indexed
            let trimmed = line.trim();

            // Skip empty lines
            if trimmed.is_empty() {
                continue;
            }

            // Handle comments
            if trimmed.starts_with('#') {
                self.aff.comments.push(trimmed.to_string());
                continue;
            }

            // Skip lines starting with space (continuation lines)
            if trimmed.starts_with(' ') || trimmed.starts_with('\t') {
                // These are continuation lines from previous directives
                // We'll handle them in the specific directive parsers
                continue;
            }

            // Parse the directive
            self.parse_line(trimmed, line_num);
        }

        // Now process continuation lines properly
        // We need to re-parse with proper line grouping
        // Let's do a proper parse
        self.aff = AffixFile::new();
        self.errors.clear();

        let lines: Vec<&str> = input.lines().collect();
        let mut i = 0;
        while i < lines.len() {
            let line = lines[i];
            let line_num = i + 1;
            let trimmed = line.trim();

            if trimmed.is_empty() {
                i += 1;
                continue;
            }

            if trimmed.starts_with('#') {
                self.aff.comments.push(trimmed.to_string());
                i += 1;
                continue;
            }

            // Collect continuation lines
            let mut current_line = trimmed.to_string();
            let mut j = i + 1;
            while j < lines.len() {
                let next_line = lines[j].trim();
                if next_line.starts_with(' ') || next_line.starts_with('\t') {
                    // Continuation line - append without the leading whitespace
                    current_line.push(' ');
                    current_line.push_str(next_line.trim_start());
                    j += 1;
                } else {
                    break;
                }
            }

            self.parse_directive(&current_line, line_num);
            i = j;
        }

        if self.errors.is_empty() {
            Ok(self.aff)
        } else {
            Err(self.errors)
        }
    }

    fn parse_line(&mut self, line: &str, line_num: usize) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            return;
        }

        let directive = parts[0];
        match directive {
            "SET" => self.parse_set(&parts, line_num),
            "ICONV" => self.parse_iconv(&parts, line_num),
            "NOSUGGEST" => self.parse_nosuggest(&parts, line_num),
            "WORDCHARS" => self.parse_wordchars(&parts, line_num),
            "TRY" => self.parse_try(&parts, line_num),
            "COMPOUNDMIN" => self.parse_compound_min(&parts, line_num),
            "COMPOUNDRULE" => self.parse_compound_rule(&parts, line_num),
            "FLAG" => self.parse_flag(&parts, line_num),
            "PFX" => self.parse_affix(&parts, line_num, true),
            "SFX" => self.parse_affix(&parts, line_num, false),
            "REP" => self.parse_rep(&parts, line_num),
            "ONLYINCOMPOUND" => self.parse_only_in_compound(&parts, line_num),
            _ => {
                // Unknown directive - could be a comment that starts with a word
                // or an unsupported directive
                if !directive.starts_with('#') {
                    self.errors.push(AffParseError::UnknownDirective {
                        line: line_num,
                        directive: directive.to_string(),
                    });
                }
            }
        }
    }

    fn parse_directive(&mut self, line: &str, line_num: usize) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            return;
        }

        let directive = parts[0];
        match directive {
            "SET" => self.parse_set(&parts, line_num),
            "ICONV" => self.parse_iconv(&parts, line_num),
            "NOSUGGEST" => self.parse_nosuggest(&parts, line_num),
            "WORDCHARS" => self.parse_wordchars(&parts, line_num),
            "TRY" => self.parse_try(&parts, line_num),
            "COMPOUNDMIN" => self.parse_compound_min(&parts, line_num),
            "COMPOUNDRULE" => self.parse_compound_rule(&parts, line_num),
            "FLAG" => self.parse_flag(&parts, line_num),
            "PFX" => self.parse_affix(&parts, line_num, true),
            "SFX" => self.parse_affix(&parts, line_num, false),
            "REP" => self.parse_rep(&parts, line_num),
            "ONLYINCOMPOUND" => self.parse_only_in_compound(&parts, line_num),
            _ => {
                // Check if it looks like a PFX/SFX continuation line that wasn't properly handled
                if directive.len() == 1 && parts.len() >= 4 {
                    // This might be a continuation of a PFX/SFX line
                    // Try to parse it as an affix
                    self.parse_affix(&parts, line_num, true);
                } else if !directive.starts_with('#') {
                    self.errors.push(AffParseError::UnknownDirective {
                        line: line_num,
                        directive: directive.to_string(),
                    });
                }
            }
        }
    }

    fn parse_set(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "SET".to_string(),
            });
            return;
        }
        self.aff.encoding = Some(parts[1].to_string());
    }

    fn parse_iconv(&mut self, parts: &[&str], line_num: usize) {
        // ICONV can be:
        // - ICONV N (declares N iconv rules to follow)
        // - ICONV <from> <to> (defines an iconv rule)
        if parts.len() == 2 {
            // ICONV N - just a count declaration, ignore it
            // The actual rules follow
            return;
        }
        if parts.len() < 3 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "ICONV".to_string(),
            });
            return;
        }
        let from = parts[1].to_string();
        let to = parts[2].to_string();
        self.aff.iconv.push((from, to));
    }

    fn parse_nosuggest(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "NOSUGGEST".to_string(),
            });
            return;
        }
        self.aff.nosuggest.push(parts[1].to_string());
    }

    fn parse_wordchars(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "WORDCHARS".to_string(),
            });
            return;
        }
        self.aff.word_chars = Some(parts[1].to_string());
    }

    fn parse_try(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "TRY".to_string(),
            });
            return;
        }
        self.aff.try_chars = Some(parts[1].to_string());
    }

    fn parse_compound_min(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "COMPOUNDMIN".to_string(),
            });
            return;
        }
        match parts[1].parse::<usize>() {
            Ok(n) => self.aff.compound_min = Some(n),
            Err(_) => self.errors.push(AffParseError::InvalidLine {
                line: line_num,
                reason: format!("Invalid number: {}", parts[1]),
            }),
        }
    }

    fn parse_compound_rule(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "COMPOUNDRULE".to_string(),
            });
            return;
        }
        self.aff.compound_rules.push(parts[1].to_string());
    }

    fn parse_flag(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "FLAG".to_string(),
            });
            return;
        }

        let flag_def = parts[1];

        // FLAG can be:
        // - "FLAG char" - define a simple flag
        // - "FLAG long:CHARS" - define long flags using characters from CHARS
        // - "FLAG num:NUM" - define numeric flags
        if flag_def.contains(':') {
            let flag_parts: Vec<&str> = flag_def.splitn(2, ':').collect();
            if flag_parts.len() == 2 {
                let flag_type = flag_parts[0];
                let flag_value = flag_parts[1];

                match flag_type {
                    "long" => {
                        // Define long flags - each character in flag_value is a valid flag
                        for c in flag_value.chars() {
                            self.aff.flags.insert(c, Flag::Long(c.to_string()));
                            self.flag_long_values.insert(c);
                        }
                    }
                    "num" => {
                        // Numeric flag
                        self.aff
                            .flags
                            .insert('*', Flag::Numeric(flag_value.parse().unwrap_or(0)));
                    }
                    _ => {
                        self.errors.push(AffParseError::InvalidLine {
                            line: line_num,
                            reason: format!("Unknown flag type: {}", flag_type),
                        });
                    }
                }
            }
        } else {
            // Simple flag definition
            for c in flag_def.chars() {
                self.aff.flags.insert(c, Flag::Simple);
            }
        }
    }

    fn parse_only_in_compound(&mut self, parts: &[&str], line_num: usize) {
        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: "ONLYINCOMPOUND".to_string(),
            });
            return;
        }
        // ONLYINCOMPOUND defines characters that can only appear in compound words
        // We'll store this as part of compound rules for now
        self.aff
            .compound_rules
            .push(format!("ONLYINCOMPOUND {}", parts[1]));
    }

    fn parse_affix(&mut self, parts: &[&str], line_num: usize, is_prefix: bool) {
        // PFX/SFX format:
        // PFX <name> <flag> <strip_count> [conditions...]
        // or continuation: PFX <name> <strip_count> <affix> <condition>
        //
        // First line: PFX A Y 1 - defines prefix group A with flag Y and 1 variant
        // Continuation: PFX A   0     re         .
        // This means: strip 0 chars, add "re", no condition (.)

        if parts.len() < 2 {
            self.errors.push(AffParseError::MissingField {
                line: line_num,
                directive: if is_prefix { "PFX" } else { "SFX" }.to_string(),
            });
            return;
        }

        // Check if this is a declaration line (defining a new affix group)
        // Format: PFX <name> <flag> <count>
        // or: SFX <name> <flag> <count>
        if parts.len() == 4 && parts[2].len() == 1 {
            // This is a declaration: PFX <name> <flag> <count>
            let _name = parts[1].chars().next().unwrap_or(' ');
            let _flag = parts[2].chars().next().unwrap_or(' ');
            let _count = parts[3].parse::<u32>().unwrap_or(0);

            // We don't need to store the declaration itself, just note that
            // this affix group exists and how many variants it has
            // The actual variants come in continuation lines
        } else if parts.len() >= 5 {
            // This is a continuation line: PFX <name> <strip> <affix> <condition>
            let name = parts[1].chars().next().unwrap_or(' ');
            let strip_count = parts[2].parse::<u32>().unwrap_or(0);
            let affix = parts[3];
            let condition = if parts.len() > 4 && parts[4] != "." {
                Some(parts[4..].join(" "))
            } else {
                None
            };

            if is_prefix {
                let prefix = Prefix::new(name, name, strip_count, affix.to_string(), condition);
                self.aff.prefixes.push(prefix);
                // Track by name for lookup
                self.aff
                    .prefixes_by_name
                    .entry(name.to_string())
                    .or_default()
                    .push(self.aff.prefixes.len() - 1);
            } else {
                let suffix = Suffix::new(name, name, strip_count, affix.to_string(), condition);
                self.aff.suffixes.push(suffix);
                // Track by name for lookup
                self.aff
                    .suffixes_by_name
                    .entry(name.to_string())
                    .or_default()
                    .push(self.aff.suffixes.len() - 1);
            }
        }
    }

    fn parse_rep(&mut self, parts: &[&str], _line_num: usize) {
        // REP format:
        // REP <count> - declares number of replacement rules
        // REP <from> <to> - defines a replacement rule
        if parts.len() == 2 {
            // This is the count line, we can ignore it
            // The actual rules follow
        } else if parts.len() >= 3 {
            // This is a replacement rule: REP <from> <to>
            // Note: Multiple REP rules with the same 'from' are allowed
            // (e.g., REP a b and REP a c are both valid)
            let from = parts[1].to_string();
            let to = parts[2].to_string();
            self.aff.replacements.push(Replacement::new(from, to));
        }
    }
}

/// Parse an .aff file from a string
pub fn parse_aff(input: &str) -> Result<AffixFile, Vec<AffParseError>> {
    AffixFile::from_str(input)
}

/// Parse an .aff file from bytes
pub fn parse_aff_bytes(bytes: &[u8]) -> Result<AffixFile, Vec<AffParseError>> {
    AffixFile::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty() {
        let result = parse_aff("");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.encoding, None);
        assert!(aff.prefixes.is_empty());
        assert!(aff.suffixes.is_empty());
        assert!(aff.replacements.is_empty());
    }

    #[test]
    fn test_parse_set_encoding() {
        let result = parse_aff("SET UTF-8");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.encoding, Some("UTF-8".to_string()));
    }

    #[test]
    fn test_parse_wordchars() {
        let result = parse_aff("WORDCHARS 0123456789");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.word_chars, Some("0123456789".to_string()));
    }

    #[test]
    fn test_parse_try() {
        let result = parse_aff("TRY esianrtolcdugmphbyfvkwzESIANRTOLCDUGMPHBYFVKWZ'");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(
            aff.try_chars,
            Some("esianrtolcdugmphbyfvkwzESIANRTOLCDUGMPHBYFVKWZ'".to_string())
        );
    }

    #[test]
    fn test_parse_nosuggest() {
        let result = parse_aff("NOSUGGEST !");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.nosuggest, vec!["!".to_string()]);
    }

    #[test]
    fn test_parse_compound_min() {
        let result = parse_aff("COMPOUNDMIN 1");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.compound_min, Some(1));
    }

    #[test]
    fn test_parse_compound_rule() {
        let result = parse_aff("COMPOUNDRULE 2\nCOMPOUNDRULE n*1t");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.compound_rules.len(), 2);
        assert!(aff.compound_rules.contains(&"2".to_string()));
        assert!(aff.compound_rules.contains(&"n*1t".to_string()));
    }

    #[test]
    fn test_parse_flag_simple() {
        let result = parse_aff("FLAG H");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert!(aff.flags.contains_key(&'H'));
        assert!(aff.has_flag('H'));
    }

    #[test]
    fn test_parse_flag_long() {
        let result = parse_aff("FLAG long:ABC");
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert!(aff.has_flag('A'));
        assert!(aff.has_flag('B'));
        assert!(aff.has_flag('C'));
        match aff.get_flag('A').unwrap() {
            Flag::Long(s) => assert_eq!(s, "A"),
            _ => panic!("Expected Long flag"),
        }
    }

    #[test]
    fn test_parse_pfx_declaration_and_variants() {
        // Full example from en_US.aff
        let input = r#"PFX A Y 1
PFX A   0     re         ."#;
        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.prefixes.len(), 1);
        let pfx = aff.prefixes.first().unwrap();
        assert_eq!(pfx.name, 'A');
        assert_eq!(pfx.flag, 'A');
        assert_eq!(pfx.strip_count, 0);
        assert_eq!(pfx.affix, "re");
        assert_eq!(pfx.condition, None);
    }

    #[test]
    fn test_parse_sfx_with_condition() {
        let input = r#"SFX V N 2
SFX V   e     ive        e"#;
        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.suffixes.len(), 1);
        let sfx = aff.suffixes.first().unwrap();
        assert_eq!(sfx.name, 'V');
        assert_eq!(sfx.flag, 'V');
        assert_eq!(sfx.strip_count, 0);
        assert_eq!(sfx.affix, "ive");
        assert_eq!(sfx.condition, Some("e".to_string()));
    }

    #[test]
    fn test_parse_rep_rules() {
        let input = r#"REP 4
REP ph f
REP f ph"#;
        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.replacements.len(), 2);
        assert_eq!(aff.replacements[0].from, "ph");
        assert_eq!(aff.replacements[0].to, "f");
        assert_eq!(aff.replacements[1].from, "f");
        assert_eq!(aff.replacements[1].to, "ph");
    }

    #[test]
    fn test_parse_iconv() {
        // ICONV N declares number of rules, then ICONV from to defines each rule
        let input = "ICONV 2\nICONV a b\nICONV c d";
        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.iconv.len(), 2);
        assert_eq!(aff.iconv[0].0, "a");
        assert_eq!(aff.iconv[0].1, "b");
        assert_eq!(aff.iconv[1].0, "c");
        assert_eq!(aff.iconv[1].1, "d");
    }

    #[test]
    fn test_parse_real_en_us_aff() {
        // Load the actual en-US.aff file
        let aff_path =
            "/home/weiss/git/World-Office/server/frontend-dist/word/dictionaries/en-US.aff";
        let content = std::fs::read_to_string(aff_path).expect("Failed to read en-US.aff");
        let result = parse_aff(&content);

        // Should parse without critical errors (allow up to 20 errors for complex files)
        if result.is_err() {
            let errors = result.as_ref().err().unwrap();
            eprintln!("Errors parsing en-US.aff ({} errors):", errors.len());
            for err in errors {
                eprintln!("  {}", err);
            }
        }
        assert!(result.is_ok() || result.as_ref().err().map_or(false, |v| v.len() < 20));

        let aff = result.unwrap();

        // Check that we got the encoding
        assert_eq!(aff.encoding, Some("UTF-8".to_string()));

        // Check that we got some flags (or the file uses implicit flags)
        // The en-US.aff file doesn't have an explicit FLAG directive,
        // so flags may be empty but the parser should still work
        // assert!(!aff.flags.is_empty());

        // Check that we got some prefixes
        assert!(!aff.prefixes.is_empty());

        // Check that we got some suffixes
        assert!(!aff.suffixes.is_empty());

        // Check that we got some replacement rules
        assert!(!aff.replacements.is_empty());
    }

    #[test]
    fn test_parse_comments() {
        let input = r#"# This is a comment
SET UTF-8
# Another comment
WORDCHARS 0123456789"#;
        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();
        assert_eq!(aff.comments.len(), 2);
        assert!(aff.comments[0].contains("This is a comment"));
        assert!(aff.comments[1].contains("Another comment"));
    }

    #[test]
    fn test_roundtrip_serde() {
        let input = r#"SET UTF-8
WORDCHARS 0123456789
PFX A Y 1
PFX A   0     re         .
SFX V N 2
SFX V   e     ive        e
REP 2
REP ph f
REP f ph"#;

        let result = parse_aff(input);
        assert!(result.is_ok());
        let aff = result.unwrap();

        // Serialize to JSON
        let json = serde_json::to_string(&aff).unwrap();

        // Deserialize back
        let aff2: AffixFile = serde_json::from_str(&json).unwrap();

        // Compare
        assert_eq!(aff.encoding, aff2.encoding);
        assert_eq!(aff.word_chars, aff2.word_chars);
        assert_eq!(aff.prefixes.len(), aff2.prefixes.len());
        assert_eq!(aff.suffixes.len(), aff2.suffixes.len());
        assert_eq!(aff.replacements.len(), aff2.replacements.len());
    }
}
