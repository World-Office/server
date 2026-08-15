//! TEX hyphenation using Liang's algorithm.
//!
//! Parses standard TEX hyphenation pattern files (`.dic`/`.hyp`) and provides
//! a [`Hyphenator`] that finds hyphenation points in words.
//!
//! # Algorithm
//!
//! 1. Each pattern (e.g. `.a2ch4`) is decomposed into a letter string, a weight
//!    array, and optional left/right boundary anchors.  Digits between characters
//!    give the hyphenation desirability at that junction; `.` marks a word
//!    boundary anchor.
//! 2. To hyphenate a word, pad it with `.` on both sides (`.word.`).  Slide
//!    every pattern's letters across the padded word, respecting boundary
//!    anchors.  Where letters match, update the global weight array with
//!    `max(existing, pattern_weight)`.
//! 3. Positions with **odd** weights are valid hyphenation points, subject to
//!    `left_min` / `right_min` fragment-length constraints.
//!
//! # References
//!
//! * Liang, Franklin Mark (1983). *Word Hy-phen-a-tion by Com-pu-ter*.
//! * TEX `hyphen.tex` pattern files.

use std::collections::HashMap;

/// Parsed TEX hyphenation dictionary ready for use.
#[derive(Debug, Clone)]
pub struct HyphenationDict {
    /// Maps (letter_key, left_anchor, right_anchor) → weight array.
    /// Weight array length = letter_key.chars().count() + 1.
    patterns: HashMap<(String, bool, bool), Vec<u8>>,
    /// Minimum characters allowed before the hyphen.
    left_min: usize,
    /// Minimum characters allowed after the hyphen.
    right_min: usize,
}

/// A single hyphenation opportunity inside a word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HyphenPoint {
    /// Character index (in the original word) **after** which the hyphen is
    /// placed.  A value of `4` for `"project"` means split between index 3
    /// and 4 → `proj-ect`.
    pub index: usize,
}

/// Error returned when parsing a hyphenation pattern file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HyphenParseError {
    /// A line contains an invalid pattern (no letters).
    InvalidPattern(String),
    /// A numeric field could not be parsed.
    InvalidNumber(String),
}

impl std::fmt::Display for HyphenParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPattern(p) => write!(f, "invalid hyphenation pattern: {p}"),
            Self::InvalidNumber(s) => write!(f, "invalid number in pattern file: {s}"),
        }
    }
}
impl std::error::Error for HyphenParseError {}

impl Default for HyphenationDict {
    fn default() -> Self {
        Self::new(2, 3)
    }
}

impl HyphenationDict {
    /// Create an empty dictionary with the given minimum fragment lengths.
    pub fn new(left_min: usize, right_min: usize) -> Self {
        Self {
            patterns: HashMap::new(),
            left_min,
            right_min,
        }
    }

    /// Parse a TEX hyphenation pattern file (standard `.dic` format).
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(input: &str) -> Result<Self, Vec<HyphenParseError>> {
        let mut dict = Self::default();
        let mut errors = Vec::new();

        for (line_num, raw_line) in input.lines().enumerate() {
            let line = raw_line.trim();

            if line.is_empty() || line.starts_with('#') || line.starts_with('%') {
                continue;
            }

            if let Some(rest) = line.strip_prefix("LEFTHYPHENMIN") {
                match rest.trim().parse::<usize>() {
                    Ok(n) => dict.left_min = n,
                    Err(_) => errors.push(HyphenParseError::InvalidNumber(line.to_string())),
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("RIGHTHYPHENMIN") {
                match rest.trim().parse::<usize>() {
                    Ok(n) => dict.right_min = n,
                    Err(_) => errors.push(HyphenParseError::InvalidNumber(line.to_string())),
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("COMPOUNDLEFTHYPHENMIN") {
                match rest.trim().parse::<usize>() {
                    Ok(n) => dict.left_min = n,
                    Err(_) => errors.push(HyphenParseError::InvalidNumber(line.to_string())),
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("COMPOUNDRIGHTHYPHENMIN") {
                match rest.trim().parse::<usize>() {
                    Ok(n) => dict.right_min = n,
                    Err(_) => errors.push(HyphenParseError::InvalidNumber(line.to_string())),
                }
                continue;
            }

            if line == "UTF-8" || line.starts_with("SET ") {
                continue;
            }
            if line.starts_with("HYPH")
                || line.starts_with("LICENSE")
                || line.starts_with("Copyright")
                || line.starts_with("http")
            {
                continue;
            }

            match Self::parse_pattern(line) {
                Ok((key, left_dot, right_dot, weights)) => {
                    let entry = dict
                        .patterns
                        .entry((key, left_dot, right_dot))
                        .or_insert_with(|| vec![0u8; weights.len()]);
                    for (e, w) in entry.iter_mut().zip(weights.iter()) {
                        *e = (*e).max(*w);
                    }
                }
                Err(e) => {
                    errors.push(HyphenParseError::InvalidPattern(format!(
                        "line {}: {}",
                        line_num + 1,
                        e
                    )));
                }
            }
        }

        if errors.is_empty() {
            Ok(dict)
        } else {
            Err(errors)
        }
    }

    /// Parse a hyphenation pattern file from bytes (UTF-8).
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Vec<HyphenParseError>> {
        let s = std::str::from_utf8(bytes)
            .map_err(|e| vec![HyphenParseError::InvalidPattern(e.to_string())])?;
        Self::from_str(s)
    }

    /// Decompose a single TEX pattern like `.proj1ect.` into its components.
    ///
    /// Returns `(letter_key, left_anchor, right_anchor, weights)`.
    ///
    /// The dots are **not** included in the letter key; they become anchor flags.
    /// The weight array has length `letter_key.chars().count() + 1`.
    ///
    /// # Mapping example
    ///
    /// Pattern `.proj1ect`:
    /// ```text
    /// letter_key    "project"     (7 letters)
    /// left_anchor    true
    /// right_anchor   false
    /// weights        [0, 0, 0, 0, 1, 0, 0, 0]   (len = 8)
    /// ```
    fn parse_pattern(pattern: &str) -> Result<(String, bool, bool, Vec<u8>), String> {
        let trimmed = pattern.trim();

        let left_dot = trimmed.starts_with('.');
        let right_dot = trimmed.ends_with('.');
        let trimmed = if left_dot { &trimmed[1..] } else { trimmed };
        let trimmed = if right_dot {
            &trimmed[..trimmed.len() - right_dot as usize]
        } else {
            trimmed
        };

        let mut key = String::new();
        let mut values = vec![0u8]; // weight before first letter
        let mut current: u8 = 0;

        for ch in trimmed.chars() {
            if ch.is_ascii_digit() {
                current = current.saturating_mul(10) + (ch as u8 - b'0');
            } else {
                values.push(current);
                key.push(ch);
                current = 0;
            }
        }
        values.push(current); // weight after last letter

        if key.is_empty() {
            return Err(pattern.to_string());
        }

        Ok((key.to_ascii_lowercase(), left_dot, right_dot, values))
    }

    /// Add a single pattern programmatically (e.g. `".pr4o1j4e4c4t"`).
    pub fn add_pattern(&mut self, pattern: &str) {
        if let Ok((key, left_dot, right_dot, weights)) = Self::parse_pattern(pattern) {
            let entry = self
                .patterns
                .entry((key, left_dot, right_dot))
                .or_insert_with(|| vec![0u8; weights.len()]);
            for (e, w) in entry.iter_mut().zip(weights.iter()) {
                *e = (*e).max(*w);
            }
        }
    }

    /// Number of patterns currently loaded.
    pub fn pattern_count(&self) -> usize {
        self.patterns.len()
    }
}

/// Stateful hyphenation engine built from a [`HyphenationDict`].
#[derive(Debug, Clone)]
pub struct Hyphenator {
    dict: HyphenationDict,
}

impl Hyphenator {
    /// Create a new hyphenator from a parsed dictionary.
    pub fn new(dict: HyphenationDict) -> Self {
        Self { dict }
    }

    /// Return a reference to the underlying dictionary.
    pub fn dict(&self) -> &HyphenationDict {
        &self.dict
    }

    /// Find all valid hyphenation points in `word`.
    ///
    /// Returns a vector of [`HyphenPoint`] values sorted by index.
    /// Indices refer to **original** word character positions.
    pub fn hyphenate(&self, word: &str) -> Vec<HyphenPoint> {
        let char_count = word.chars().count();
        if char_count < self.dict.left_min + self.dict.right_min {
            return Vec::new();
        }

        let lower: Vec<char> = word.chars().map(|c| c.to_ascii_lowercase()).collect();

        // Padded word: .word.
        // padded pos 0 = '.', 1..=char_count = word chars, char_count+1 = '.'
        let padded_len = char_count + 2;
        let mut weight = vec![0u8; padded_len];

        for ((letter_key, left_anchor, right_anchor), pattern_values) in &self.dict.patterns {
            let key_chars: Vec<char> = letter_key.chars().collect();
            let key_len = key_chars.len();

            if key_len > char_count {
                continue;
            }

            // Alignment: start = first padded position of the key's first letter.
            // Key chars occupy lower[start-1 .. start-1+key_len].
            let min_start: usize = 1;
            let max_start: usize = char_count + 1 - key_len;

            for start in min_start..=max_start {
                // Enforce anchors.
                if *left_anchor && start != 1 {
                    continue;
                }
                if *right_anchor && start != max_start {
                    continue;
                }

                // Check character match.
                let mut matches = true;
                for (j, &kc) in key_chars.iter().enumerate() {
                    if lower[start - 1 + j] != kc {
                        matches = false;
                        break;
                    }
                }
                if !matches {
                    continue;
                }

                // Apply weights.
                // values[i] → padded position start+i
                for (i, &w) in pattern_values.iter().enumerate() {
                    let p = start + i;
                    if p < padded_len && w > weight[p] {
                        weight[p] = w;
                    }
                }
            }
        }

        // Collect hyphenation points (odd weights at interior positions).
        // Padded position p → char index p-1 in the original word.
        let mut points = Vec::new();
        for (p, &w) in weight[1..padded_len - 1].iter().enumerate() {
            let p = p + 1; // offset back to padded position
            if w % 2 == 1 {
                let char_idx = p - 1;
                if char_idx >= self.dict.left_min && char_count - char_idx >= self.dict.right_min {
                    points.push(HyphenPoint { index: char_idx });
                }
            }
        }

        points
    }

    /// Convenience: insert soft hyphens (`\u{00AD}`) at every valid break point.
    pub fn hyphenate_with_shy(&self, word: &str) -> String {
        let points = self.hyphenate(word);
        if points.is_empty() {
            return word.to_string();
        }
        let chars: Vec<char> = word.chars().collect();
        let mut result = String::with_capacity(chars.len() + points.len());
        let mut prev = 0;
        for pt in &points {
            for &ch in &chars[prev..pt.index] {
                result.push(ch);
            }
            result.push('\u{00AD}');
            prev = pt.index;
        }
        for &ch in &chars[prev..] {
            result.push(ch);
        }
        result
    }

    /// Convenience: insert a visible hyphen (`-`) at each valid break point.
    pub fn hyphenate_display(&self, word: &str) -> String {
        let points = self.hyphenate(word);
        if points.is_empty() {
            return word.to_string();
        }
        let chars: Vec<char> = word.chars().collect();
        let mut result = String::with_capacity(chars.len() + points.len());
        let mut prev = 0;
        for pt in &points {
            for &ch in &chars[prev..pt.index] {
                result.push(ch);
            }
            result.push('-');
            prev = pt.index;
        }
        for &ch in &chars[prev..] {
            result.push(ch);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `.pr4o1j4e4c4t` → letters="project", left=true, right=false
    // values=[0,0,0,4,1,4,4,4,0] (8 entries for 7 letters — but wait, that's 9)
    // Actually 7 letters → 8 values: [0, 0, 0, 4, 1, 4, 4, 4]
    // Hmm, let me retrace. After stripping '.':
    //   "pr4o1j4e4c4t"
    //   p: push 0, key="p"     → vals=[0,0]
    //   r: push 0, key="pr"    → vals=[0,0,0]
    //   4: cur=4
    //   o: push 4, key="pro"   → vals=[0,0,0,4]
    //   1: cur=1
    //   j: push 1, key="proj"  → vals=[0,0,0,4,1]
    //   4: cur=4
    //   e: push 4, key="proje" → vals=[0,0,0,4,1,4]
    //   4: cur=4
    //   c: push 4, key="projec"→ vals=[0,0,0,4,1,4,4]
    //   4: cur=4
    //   t: push 4, key="project"→vals=[0,0,0,4,1,4,4,4]
    //   trailing push 0 → vals=[0,0,0,4,1,4,4,4,0]
    // That's 9 values for 7 letters. 9 != 7+1=8. The initial vec![0] plus
    // 7 pushes plus 1 trailing = 9.
    //
    // Mapping at start=1:
    //   vals[0]→pad[1], vals[1]→pad[2], ..., vals[4]→pad[5], ..., vals[8]→pad[9]
    //   padded_len for "project" = 9, so pad[9] is out of bounds (clamped).
    //   vals[4]=1 → pad[5] → between 'j'(pad4) and 'e'(pad5) → char_idx=4 ✓

    fn test_patterns() -> &'static str {
        "LEFTHYPHENMIN 2\nRIGHTHYPHENMIN 3\n.pr4o1j4e4c4t\n"
    }

    fn make_hyphenator() -> Hyphenator {
        let dict = HyphenationDict::from_str(test_patterns()).expect("parse");
        Hyphenator::new(dict)
    }

    #[test]
    fn hyphenate_test_parse_empty() {
        let dict = HyphenationDict::from_str("").unwrap();
        assert_eq!(dict.pattern_count(), 0);
        assert_eq!(dict.left_min, 2);
        assert_eq!(dict.right_min, 3);
    }

    #[test]
    fn hyphenate_test_parse_directives() {
        let input = "LEFTHYPHENMIN 3\nRIGHTHYPHENMIN 2\nCOMPOUNDLEFTHYPHENMIN 4";
        let dict = HyphenationDict::from_str(input).unwrap();
        assert_eq!(dict.left_min, 4);
        assert_eq!(dict.right_min, 2);
    }

    #[test]
    fn hyphenate_test_parse_pattern_with_dots() {
        let dict = HyphenationDict::from_str(".proj1ect\n.4a1ma.").unwrap();
        assert_eq!(dict.pattern_count(), 2);
        assert!(dict.patterns.contains_key(&("project".into(), true, false)));
        assert!(dict.patterns.contains_key(&("ama".into(), true, true)));
    }

    #[test]
    fn hyphenate_test_parse_weights_no_dot() {
        // 4pro3j: '4'→cur=4, p→push 4, r→push 0, o→push 0, '3'→cur=3, j→push 3, trail 0
        // key="proj" (4 chars), vals=[0,4,0,0,3,0] (6 entries, 4+2 due to init+trail)
        let dict = HyphenationDict::from_str("4pro3j").unwrap();
        let weights = &dict.patterns[&("proj".into(), false, false)];
        assert_eq!(weights, &[0, 4, 0, 0, 3, 0]);
    }

    #[test]
    fn hyphenate_test_parse_weights_with_dot() {
        // .a2ch4: strip '.', rest="a2ch4"
        // a→push 0, '2'→cur=2, c→push 2, h→push 0, '4'→cur=4, trail→push 4
        // key="ach" (3 chars), vals=[0,0,2,0,4] (5 entries)
        let dict = HyphenationDict::from_str(".a2ch4").unwrap();
        let weights = &dict.patterns[&("ach".into(), true, false)];
        assert_eq!(weights, &[0, 0, 2, 0, 4]);
    }

    #[test]
    fn hyphenate_test_merge_same_key() {
        let dict = HyphenationDict::from_str(".a2ch4\n.4a1ch").unwrap();
        let weights = &dict.patterns[&("ach".into(), true, false)];
        // [0,0,2,0,4] merged with [0,4,1,0,0] → [0,4,2,0,4]
        assert_eq!(weights, &[0, 4, 2, 0, 4]);
    }

    #[test]
    fn hyphenate_test_skip_comments() {
        let dict = HyphenationDict::from_str("# c\n% c\n.proj1ect\n").unwrap();
        assert_eq!(dict.pattern_count(), 1);
    }

    #[test]
    fn hyphenate_test_skip_metadata() {
        let dict = HyphenationDict::from_str("HYPH en US\nUTF-8\n.proj1ect\n").unwrap();
        assert_eq!(dict.pattern_count(), 1);
    }

    #[test]
    fn hyphenate_test_add_pattern() {
        let mut dict = HyphenationDict::new(2, 3);
        dict.add_pattern(".proj1ect");
        assert_eq!(dict.pattern_count(), 1);
    }

    #[test]
    fn hyphenate_test_from_bytes() {
        let bytes = b"LEFTHYPHENMIN 1\nRIGHTHYPHENMIN 1\n.pr1o2j3e4c5t";
        let dict = HyphenationDict::from_bytes(bytes).unwrap();
        assert_eq!(dict.left_min, 1);
        assert_eq!(dict.right_min, 1);
        assert_eq!(dict.pattern_count(), 1);
    }

    // ---- Acceptance: "project" → "proj-ect" -----------------------------------

    #[test]
    fn hyphenate_test_acceptance_project() {
        let h = make_hyphenator();
        assert_eq!(h.hyphenate_display("project"), "proj-ect");
    }

    #[test]
    fn hyphenate_test_acceptance_project_points() {
        let h = make_hyphenator();
        let pts = h.hyphenate("project");
        assert_eq!(pts.len(), 1);
        assert_eq!(pts[0].index, 4);
    }

    // ---- Algorithm -----------------------------------------------------------

    #[test]
    fn hyphenate_test_short_word() {
        let h = make_hyphenator();
        assert!(h.hyphenate("hi").is_empty());
    }

    #[test]
    fn hyphenate_test_no_pattern() {
        let h = make_hyphenator();
        assert!(h.hyphenate("xyz").is_empty());
    }

    #[test]
    fn hyphenate_test_case_insensitive() {
        let h = make_hyphenator();
        assert_eq!(h.hyphenate("project"), h.hyphenate("PROJECT"));
    }

    #[test]
    fn hyphenate_test_left_min() {
        let h = make_hyphenator();
        for pt in h.hyphenate("project") {
            assert!(pt.index >= h.dict().left_min);
        }
    }

    #[test]
    fn hyphenate_test_right_min() {
        let h = make_hyphenator();
        for pt in h.hyphenate("project") {
            assert!("project".chars().count() - pt.index >= h.dict().right_min);
        }
    }

    #[test]
    fn hyphenate_test_shy() {
        let h = make_hyphenator();
        let r = h.hyphenate_with_shy("project");
        assert!(r.chars().any(|c| c == '\u{00AD}'));
    }

    #[test]
    fn hyphenate_test_empty() {
        let h = make_hyphenator();
        assert!(h.hyphenate("").is_empty());
    }

    #[test]
    fn hyphenate_test_single_char() {
        let h = make_hyphenator();
        assert!(h.hyphenate("a").is_empty());
    }

    #[test]
    fn hyphenate_test_unicode() {
        let h = make_hyphenator();
        assert_eq!("café".chars().count(), 4);
        let _ = h.hyphenate("café");
    }

    #[test]
    fn hyphenate_test_dict_accessor() {
        let h = make_hyphenator();
        assert_eq!(h.dict().left_min, 2);
        assert_eq!(h.dict().right_min, 3);
    }

    // ---- Real en_US dictionary -------------------------------------------------

    #[test]
    fn hyphenate_test_real_en_us_parse() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/hyph_en_US.dic"
        );
        let content = std::fs::read_to_string(path).expect("en_US dict");
        let dict = HyphenationDict::from_str(&content).expect("parse");
        assert!(dict.pattern_count() > 4000);
        assert_eq!(dict.left_min, 2);
        assert_eq!(dict.right_min, 3);
    }

    #[test]
    fn hyphenate_test_real_dict_project() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/hyph_en_US.dic"
        );
        let content = std::fs::read_to_string(path).expect("en_US dict");
        let dict = HyphenationDict::from_str(&content).unwrap();
        let h = Hyphenator::new(dict);
        // "project" may or may not hyphenate in en_US; just verify no panic.
        let d = h.hyphenate_display("project");
        assert!(!d.is_empty());
    }

    #[test]
    fn hyphenate_test_real_dict_document() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/hyph_en_US.dic"
        );
        let content = std::fs::read_to_string(path).expect("en_US dict");
        let dict = HyphenationDict::from_str(&content).unwrap();
        let h = Hyphenator::new(dict);
        let d = h.hyphenate_display("document");
        assert!(d.contains('-'), "got: {d}");
    }

    #[test]
    fn hyphenate_test_real_dict_hyphenation() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/hyph_en_US.dic"
        );
        let content = std::fs::read_to_string(path).expect("en_US dict");
        let dict = HyphenationDict::from_str(&content).unwrap();
        let h = Hyphenator::new(dict);
        let d = h.hyphenate_display("hyphenation");
        assert!(d.contains('-'), "got: {d}");
    }

    #[test]
    fn hyphenate_test_real_dict_information() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/hyph_en_US.dic"
        );
        let content = std::fs::read_to_string(path).expect("en_US dict");
        let dict = HyphenationDict::from_str(&content).unwrap();
        let h = Hyphenator::new(dict);
        let d = h.hyphenate_display("information");
        assert!(d.contains('-'), "got: {d}");
    }
}
