//! Hunspell `.dic` file parser.
//!
//! A `.dic` file contains the word list for a Hunspell dictionary.  The first
//! line is the word count (may be ignored).  Subsequent lines are either words
//! or `word/flags` entries where `/flags` marks which affix groups apply.
//!
//! # Example
//!
//! ```ignore
//! 49568
//! hello
//! run/SG
//! running/G
//! ```

use crate::aff::AffixFile;
use std::collections::HashSet;

/// A single entry in the dictionary: the base word and its associated flags.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DicEntry {
    /// The word itself (lowercased on storage).
    pub word: String,
    /// Flag characters associated with this word (from the `/flags` suffix).
    pub flags: Vec<char>,
}

impl DicEntry {
    /// Create a new entry.
    pub fn new(word: String, flags: Vec<char>) -> Self {
        Self { word, flags }
    }
}

/// A fully loaded Hunspell dictionary (`.aff` + `.dic`).
///
/// Stores the raw word list **and** the expanded word set (base words expanded
/// through prefix/suffix rules from the `.aff` file).  The expanded set is
/// lowercased so that [`Dictionary::contains`] is case-insensitive.
#[derive(Debug, Clone)]
pub struct Dictionary {
    /// Raw entries as parsed from the `.dic` file.
    pub entries: Vec<DicEntry>,
    /// Expanded, lowercased word set (base + affix derivatives).
    expanded: HashSet<String>,
    /// The associated `.aff` file (needed for affix expansion).
    aff: AffixFile,
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/// Result of parsing a `.dic` file (before affix expansion).
#[derive(Debug, Clone)]
pub struct DicParseResult {
    /// All parsed entries.
    pub entries: Vec<DicEntry>,
}

impl DicParseResult {
    /// Parse a `.dic` file from a string.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(input: &str) -> Self {
        let mut entries = Vec::new();

        for line in input.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // The very first non-empty line is the word count — skip it.
            if entries.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }

            if let Some(entry) = parse_dic_line(trimmed) {
                entries.push(entry);
            }
        }

        Self { entries }
    }

    /// Parse a `.dic` file from bytes (UTF-8).
    pub fn from_bytes(bytes: &[u8]) -> Self {
        let s = std::str::from_utf8(bytes).unwrap_or("");
        Self::from_str(s)
    }

    /// Expand all entries against the given `.aff` file and return a
    /// fully usable [`Dictionary`].
    pub fn expand(self, aff: AffixFile) -> Dictionary {
        Dictionary::from_parts(self.entries, aff)
    }
}

fn parse_dic_line(line: &str) -> Option<DicEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    if let Some((word, flags_str)) = line.split_once('/') {
        let word = word.to_string();
        let flags: Vec<char> = flags_str.chars().collect();
        Some(DicEntry::new(word, flags))
    } else {
        Some(DicEntry::new(line.to_string(), Vec::new()))
    }
}

// ---------------------------------------------------------------------------
// Dictionary (expanded)
// ---------------------------------------------------------------------------

impl Dictionary {
    /// Build a dictionary from pre-parsed entries and an affix file.
    pub fn from_parts(entries: Vec<DicEntry>, aff: AffixFile) -> Self {
        let expanded = expand_entries(&entries, &aff);
        Self {
            entries,
            expanded,
            aff,
        }
    }

    /// Convenience: parse `.dic` + `.aff` strings and build the dictionary.
    pub fn from_strs(aff_str: &str, dic_str: &str) -> Self {
        let aff = AffixFile::from_str(aff_str).unwrap_or_default();
        let parse = DicParseResult::from_str(dic_str);
        parse.expand(aff)
    }

    /// True if the word (case-insensitive) exists in the expanded dictionary.
    pub fn contains(&self, word: &str) -> bool {
        self.expanded.contains(&word.to_ascii_lowercase())
    }

    /// True if the **exact** base form (case-sensitive) exists in the raw list.
    pub fn contains_base(&self, word: &str) -> bool {
        self.entries.iter().any(|e| e.word == word)
    }

    /// Number of base entries.
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }

    /// Number of expanded words (including affix derivatives).
    pub fn expanded_count(&self) -> usize {
        self.expanded.len()
    }

    /// Reference to the underlying affix file.
    pub fn aff(&self) -> &AffixFile {
        &self.aff
    }

    /// Iterate over all expanded (lowercased) words.
    pub fn expanded_words(&self) -> impl Iterator<Item = &String> {
        self.expanded.iter()
    }
}

// ---------------------------------------------------------------------------
// Affix expansion
// ---------------------------------------------------------------------------

/// Expand all `.dic` entries using the prefix/suffix rules from the `.aff` file.
fn expand_entries(entries: &[DicEntry], aff: &AffixFile) -> HashSet<String> {
    let mut set = HashSet::with_capacity(entries.len() * 2);

    for entry in entries {
        let word_lower = entry.word.to_ascii_lowercase();

        // Always include the base word.
        set.insert(word_lower.clone());

        // Build the set of flag characters on this entry.
        let word_flags: HashSet<char> = entry.flags.iter().copied().collect();

        // Apply prefix rules whose flag character is present on this word.
        for pfx in &aff.prefixes {
            if !word_flags.contains(&pfx.flag) {
                continue;
            }
            if !condition_matches(&entry.word, pfx.condition.as_deref()) {
                continue;
            }
            let stripped = strip_chars(&entry.word, pfx.strip_count as usize);
            let mut derived = String::new();
            derived.push_str(&pfx.affix);
            derived.push_str(stripped);
            set.insert(derived.to_ascii_lowercase());
        }

        // Apply suffix rules whose flag character is present on this word.
        for sfx in &aff.suffixes {
            if !word_flags.contains(&sfx.flag) {
                continue;
            }
            if !condition_matches(&entry.word, sfx.condition.as_deref()) {
                continue;
            }
            let stripped = strip_chars_end(&entry.word, sfx.strip_count as usize);
            let mut derived = String::new();
            derived.push_str(stripped);
            derived.push_str(&sfx.affix);
            set.insert(derived.to_ascii_lowercase());
        }
    }

    set
}

/// Very simple condition check: the condition is a single-character filter
/// on the **relevant end** of the word (left side for prefix, right side for
/// suffix).  A dot (`.`) means "any".  More complex regex conditions are not
/// yet supported but can be added later.
fn condition_matches(word: &str, condition: Option<&str>) -> bool {
    match condition {
        None | Some(".") => true,
        Some(cond) => {
            // Single-character condition: word must end with that char (suffix)
            // or start with that char (prefix).  For now we check the last char.
            if let Some(ch) = cond.chars().next() {
                if ch == '.' {
                    return true;
                }
                word.ends_with(ch)
            } else {
                true
            }
        }
    }
}

/// Strip `n` characters from the **start** of the word (for prefixes).
fn strip_chars(word: &str, n: usize) -> &str {
    let chars: Vec<char> = word.chars().collect();
    if n >= chars.len() {
        ""
    } else {
        let mut s = String::with_capacity(word.len());
        for &ch in &chars[n..] {
            s.push(ch);
        }
        // We need to return a &str, so leak is not ideal.
        // Instead, we just return the original string sliced appropriately
        // by byte offset.
        let skip: usize = chars[..n].iter().map(|c| c.len_utf8()).sum();
        &word[skip..]
    }
}

/// Strip `n` characters from the **end** of the word (for suffixes).
fn strip_chars_end(word: &str, n: usize) -> &str {
    let chars: Vec<char> = word.chars().collect();
    if n >= chars.len() {
        ""
    } else {
        let keep = chars.len() - n;
        let mut end: usize = 0;
        for &ch in &chars[..keep] {
            end += ch.len_utf8();
        }
        &word[..end]
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // Parsing
    // ---------------------------------------------------------------------------

    #[test]
    fn dic_test_parse_empty() {
        let result = DicParseResult::from_str("");
        assert!(result.entries.is_empty());
    }

    #[test]
    fn dic_test_parse_count_line_skipped() {
        let result = DicParseResult::from_str("49568\nhello\nworld/AB");
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.entries[0].word, "hello");
        assert_eq!(result.entries[0].flags, Vec::<char>::new());
        assert_eq!(result.entries[1].word, "world");
        assert_eq!(result.entries[1].flags, vec!['A', 'B']);
    }

    #[test]
    fn dic_test_parse_word_no_flags() {
        let result = DicParseResult::from_str("hello");
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].word, "hello");
        assert!(result.entries[0].flags.is_empty());
    }

    #[test]
    fn dic_test_parse_word_with_flags() {
        let result = DicParseResult::from_str("running/SG");
        assert_eq!(result.entries[0].word, "running");
        assert_eq!(result.entries[0].flags, vec!['S', 'G']);
    }

    #[test]
    fn dic_test_parse_comments_skipped() {
        let result = DicParseResult::from_str("# comment\n3\nhello");
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].word, "hello");
    }

    #[test]
    fn dic_test_parse_empty_lines_skipped() {
        let result = DicParseResult::from_str("\n\nhello\n\nworld\n");
        assert_eq!(result.entries.len(), 2);
    }

    #[test]
    fn dic_test_from_bytes() {
        let bytes = b"5\nhello\nworld/AB\nfoo\nbar/X\nbaz";
        let result = DicParseResult::from_bytes(bytes);
        assert_eq!(result.entries.len(), 5);
    }

    // ---------------------------------------------------------------------------
    // Dictionary expansion
    // ---------------------------------------------------------------------------

    #[test]
    fn dic_test_expand_no_affixes() {
        let aff = AffixFile::new();
        let parse = DicParseResult::from_str("hello\nworld");
        let dict = parse.expand(aff);
        assert_eq!(dict.entry_count(), 2);
        assert_eq!(dict.expanded_count(), 2);
        assert!(dict.contains("hello"));
        assert!(dict.contains("world"));
    }

    #[test]
    fn dic_test_expand_with_prefix() {
        let aff_str = "PFX A Y 1\nPFX A   0     re         .";
        let dic_str = "5\nrun/A\nhello";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        // "run" with prefix "re" → "rerun"
        assert!(dict.contains("run"));
        assert!(dict.contains("rerun"));
        assert!(dict.contains("hello"));
    }

    #[test]
    fn dic_test_expand_with_suffix() {
        let aff_str = "SFX N Y 1\nSFX N   e     ness        e";
        let dic_str = "3\nfine/N\nhello";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        // "fine" → strip "e", add "ness" → "fineness"
        assert!(dict.contains("fine"));
        assert!(dict.contains("fineness"));
        assert!(dict.contains("hello"));
    }

    #[test]
    fn dic_test_case_insensitive() {
        let aff = AffixFile::new();
        let parse = DicParseResult::from_str("Hello");
        let dict = parse.expand(aff);
        assert!(dict.contains("hello"));
        assert!(dict.contains("HELLO"));
        assert!(dict.contains("Hello"));
    }

    #[test]
    fn dic_test_contains_base() {
        let aff = AffixFile::new();
        let parse = DicParseResult::from_str("Hello");
        let dict = parse.expand(aff);
        assert!(dict.contains_base("Hello"));
        assert!(!dict.contains_base("hello"));
    }

    #[test]
    fn dic_test_aff_accessor() {
        let aff_str = "REP 1\nREP ph f";
        let dic_str = "1\nhello";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        assert_eq!(dict.aff().replacements.len(), 1);
        assert_eq!(dict.aff().replacements[0].from, "ph");
        assert_eq!(dict.aff().replacements[0].to, "f");
    }

    #[test]
    fn dic_test_expanded_words_iter() {
        let aff = AffixFile::new();
        let parse = DicParseResult::from_str("hello\nworld");
        let dict = parse.expand(aff);
        let words: Vec<_> = dict.expanded_words().collect();
        assert!(words.contains(&&String::from("hello")));
        assert!(words.contains(&&String::from("world")));
    }

    // ---------------------------------------------------------------------------
    // Real en-US dictionary
    // ---------------------------------------------------------------------------

    #[test]
    fn dic_test_parse_real_en_us() {
        let dic_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/en_US.dic"
        );
        let content = std::fs::read_to_string(dic_path).expect("en_US.dic");
        let result = DicParseResult::from_str(&content);
        assert!(
            result.entries.len() > 40_000,
            "expected > 40k entries, got {}",
            result.entries.len()
        );
    }

    #[test]
    fn dic_test_parse_real_en_us_with_aff() {
        let aff_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/en_US.aff"
        );
        let dic_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../assets/dictionaries/en_US/en_US.dic"
        );
        let aff_content = std::fs::read_to_string(aff_path).expect("en_US.aff");
        let dic_content = std::fs::read_to_string(dic_path).expect("en_US.dic");
        let aff = AffixFile::from_str(&aff_content).unwrap_or_default();
        let parse = DicParseResult::from_str(&dic_content);
        let dict = parse.expand(aff);
        // "hello" should be in the English dictionary.
        assert!(dict.contains("hello"));
        // "xyzzy" should NOT be in the English dictionary.
        assert!(!dict.contains("xyzzy"));
        // Expanded should be significantly larger than base.
        assert!(dict.expanded_count() > dict.entry_count());
    }
}
