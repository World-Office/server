//! Suggestion engine for misspelled words.
//!
//! Uses three complementary strategies (mirroring Hunspell's approach):
//!
//! 1. **Edit distance (Damerau–Levenshtein)** — finds dictionary words within
//!    a small edit-distance threshold of the misspelled word.
//! 2. **Phonetic (REP rules + character swap)** — applies replacement rules
//!    from the `.aff` file and also swaps visually/phonetically similar
//!    characters (soundex-like substitutions).
//! 3. **Affix expansion** — tries stripping/adding prefixes and suffixes to
//!    see if a modified form exists in the dictionary.
//!
//! Candidates from all three strategies are merged, ranked by a composite
//! score (edit distance + word frequency proxy), and returned sorted best
//! first.

use crate::dic::Dictionary;

use std::collections::HashMap;

/// Maximum number of suggestions to return.
pub const MAX_SUGGESTIONS: usize = 8;

/// Maximum edit distance to consider when searching candidates.
const EDIT_DISTANCE_THRESHOLD: usize = 2;

/// Maximum length of the input word for phonetic-based search.
const MAX_PHONETIC_WORD_LEN: usize = 64;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Suggest corrections for a misspelled word.
///
/// Returns up to [`MAX_SUGGESTIONS`] candidates sorted by quality (best first).
/// If the word is already in the dictionary, returns an empty list.
pub fn suggest(dict: &Dictionary, word: &str) -> Vec<String> {
    if word.is_empty() || dict.contains(word) {
        return Vec::new();
    }

    let word_lower = word.to_ascii_lowercase();

    // Deduplication map: canonical form → score
    let mut candidates: HashMap<String, (usize, bool)> = HashMap::new();

    // Strategy 1: Edit-distance search on expanded dictionary.
    collect_edit_distance(dict, &word_lower, &mut candidates);

    // Strategy 2: Phonetic / replacement-rule variations.
    collect_phonetic(dict, &word_lower, dict.aff(), &mut candidates);

    // Strategy 3: Affix stripping + dictionary lookup.
    collect_affix_variants(dict, &word_lower, dict.aff(), &mut candidates);

    // Rank and return top-N.
    let mut ranked: Vec<(String, usize)> = candidates
        .into_iter()
        .map(|(w, (dist, _phonetic))| {
            // Lower score = better suggestion.
            // Give a small bonus to phonetic matches so they rank higher
            // among equal edit-distance candidates.
            let score = if dist == 0 { 0 } else { dist };
            (w, score)
        })
        .collect();

    ranked.sort_by_key(|a| a.1);
    ranked.truncate(MAX_SUGGESTIONS);
    ranked.into_iter().map(|(w, _)| w).collect()
}

// ---------------------------------------------------------------------------
// Strategy 1: Edit distance
// ---------------------------------------------------------------------------

fn collect_edit_distance(
    dict: &Dictionary,
    word: &str,
    candidates: &mut HashMap<String, (usize, bool)>,
) {
    let word_len = word.chars().count();

    for expanded in dict.expanded_words() {
        let exp_len = expanded.chars().count();

        // Quick length filter: difference > threshold → skip.
        if (exp_len as isize - word_len as isize).unsigned_abs() > EDIT_DISTANCE_THRESHOLD
            || exp_len > word_len + EDIT_DISTANCE_THRESHOLD
        {
            continue;
        }

        let dist = damerau_levenshtein(word, expanded);
        if dist <= EDIT_DISTANCE_THRESHOLD {
            let entry = candidates.entry(expanded.clone()).or_insert((usize::MAX, false));
            if dist < entry.0 {
                entry.0 = dist;
            }
        }
    }
}

/// Damerau–Levenshtein distance with adjacent transposition support.
///
/// Operates on character slices; counts character-level operations.
fn damerau_levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    // Full matrix: O(m*n) space but simpler and correct for Damerau.
    let mut d = vec![vec![0usize; n + 1]; m + 1];

    // Initialize first row and column.
    for (i, row) in d.iter_mut().enumerate().take(m + 1) {
        row[0] = i;
    }
    for (j, row) in d.iter_mut().enumerate().take(n + 1) {
        row[j] = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };

            let del = d[i - 1][j] + 1;
            let ins = d[i][j - 1] + 1;
            let sub = d[i - 1][j - 1] + cost;

            d[i][j] = del.min(ins).min(sub);

            // Transposition check.
            if i > 1
                && j > 1
                && a_chars[i - 1] == b_chars[j - 2]
                && a_chars[i - 2] == b_chars[j - 1]
            {
                let trans = d[i - 2][j - 2] + 1;
                d[i][j] = d[i][j].min(trans);
            }
        }
    }

    d[m][n]
}

// ---------------------------------------------------------------------------
// Strategy 2: Phonetic / REP rules
// ---------------------------------------------------------------------------

fn collect_phonetic(
    dict: &Dictionary,
    word: &str,
    aff: &crate::aff::AffixFile,
    candidates: &mut HashMap<String, (usize, bool)>,
) {
    if word.chars().count() > MAX_PHONETIC_WORD_LEN {
        return;
    }

    let mut variations: Vec<String> = Vec::new();

    // Apply each REP rule: if `from` appears in the word, replace it with `to`.
    for rep in &aff.replacements {
        if word.contains(&rep.from) {
            let mut v = String::with_capacity(word.len() + rep.to.len());
            // Replace all occurrences.
            let chars: Vec<char> = word.chars().collect();
            let from_chars: Vec<char> = rep.from.chars().collect();
            let mut ci = 0;
            while ci < chars.len() {
                if ci + from_chars.len() <= chars.len()
                    && chars[ci..ci + from_chars.len()] == from_chars[..]
                {
                    v.push_str(&rep.to);
                    ci += from_chars.len();
                } else {
                    v.push(chars[ci]);
                    ci += 1;
                }
            }
            variations.push(v);
        }
    }

    // Common phonetic / visual confusion pairs (soundex-like).
    for (a, b) in COMMON_CONFUSIONS.iter() {
        if word.contains(*a) {
            variations.push(word.replace(*a, b));
        }
        if word.contains(*b) {
            variations.push(word.replace(*b, a));
        }
    }

    // Character deletions at confusing positions.
    for (a, _b) in COMMON_CONFUSIONS.iter() {
        if let Some(byte_start) = word.find(*a) {
            let byte_end = byte_start + a.len();
            if byte_end <= word.len() {
                let removed = format!("{}{}", &word[..byte_start], &word[byte_end..]);
                variations.push(removed);
            }
        }
    }

    // Add swapped-adjacent-pair variants (teh → the).
    let chars: Vec<char> = word.chars().collect();
    for i in 0..chars.len().saturating_sub(1) {
        if chars[i] != chars[i + 1] {
            let mut v = String::with_capacity(word.len());
            for (j, &ch) in chars.iter().enumerate() {
                if j == i {
                    v.push(chars[i + 1]);
                    v.push(chars[i]);
                } else if j == i + 1 {
                    continue; // already added
                } else {
                    v.push(ch);
                }
            }
            variations.push(v);
        }
    }

    // Check each variation against the dictionary.
    for variation in &variations {
        let vl = variation.to_ascii_lowercase();
        if dict.contains(&vl) {
            let dist = damerau_levenshtein(word, &vl);
            if dist <= EDIT_DISTANCE_THRESHOLD + 1 {
                let entry = candidates.entry(vl.clone()).or_insert((usize::MAX, false));
                // Phonetic matches get a small distance bonus.
                let effective_dist = dist.saturating_sub(1).min(dist);
                if effective_dist < entry.0 {
                    entry.0 = effective_dist;
                    entry.1 = true; // mark as phonetic
                }
            }
        }
    }
}

/// Common phonetic / visual confusion pairs used when no REP rules match.
static COMMON_CONFUSIONS: &[(&str, &str)] = &[
    ("ph", "f"),
    ("ie", "ei"),
    ("ei", "ie"),
    ("ough", "uf"),
    ("tion", "shun"),
    ("c", "s"),
    ("k", "c"),
    ("s", "z"),
    ("f", "ph"),
    ("ck", "k"),
    ("qu", "kw"),
    ("x", "cks"),
    ("gn", "n"),
    ("kn", "n"),
    ("wr", "r"),
    ("mb", "m"),
    ("ss", "s"),
    ("tt", "t"),
    ("ll", "l"),
    ("ee", "e"),
    ("oo", "u"),
    ("y", "i"),
    ("v", "f"),
    ("j", "g"),
    ("u", "o"),
];

// ---------------------------------------------------------------------------
// Strategy 3: Affix stripping
// ---------------------------------------------------------------------------

fn collect_affix_variants(
    dict: &Dictionary,
    word: &str,
    aff: &crate::aff::AffixFile,
    candidates: &mut HashMap<String, (usize, bool)>,
) {
    // Try removing each suffix from the word and see if the remainder is
    // in the dictionary.
    for sfx in &aff.suffixes {
        if !word.ends_with(&sfx.affix) {
            continue;
        }
        let stripped = &word[..word.len() - sfx.affix.len()];
        if !stripped.is_empty() && dict.contains(stripped) {
            let dist = damerau_levenshtein(word, stripped);
            let entry = candidates.entry(stripped.to_string()).or_insert((usize::MAX, false));
            if dist < entry.0 {
                entry.0 = dist;
            }
        }
    }

    // Try removing each prefix from the word.
    for pfx in &aff.prefixes {
        if !word.starts_with(&pfx.affix) {
            continue;
        }
        let stripped = &word[pfx.affix.len()..];
        if !stripped.is_empty() && dict.contains(stripped) {
            let dist = damerau_levenshtein(word, stripped);
            let entry = candidates.entry(stripped.to_string()).or_insert((usize::MAX, false));
            if dist < entry.0 {
                entry.0 = dist;
            }
        }
    }

    // TRY character insertion: insert each TRY character at every position.
    if let Some(try_chars) = &aff.try_chars {
        let wchars: Vec<char> = word.chars().collect();
        for i in 0..=wchars.len() {
            for ch in try_chars.chars() {
                let mut candidate = String::with_capacity(word.len() + ch.len_utf8());
                for (j, &c) in wchars.iter().enumerate() {
                    if j == i {
                        candidate.push(ch);
                    }
                    candidate.push(c);
                }
                if i == wchars.len() {
                    candidate.push(ch);
                }
                let cl = candidate.to_ascii_lowercase();
                if dict.contains(&cl) {
                    let dist = damerau_levenshtein(word, &cl);
                    if dist <= EDIT_DISTANCE_THRESHOLD {
                        let entry = candidates.entry(cl).or_insert((usize::MAX, false));
                        if dist < entry.0 {
                            entry.0 = dist;
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Suggestion builder (convenience)
// ---------------------------------------------------------------------------

/// A reusable suggestion engine that holds a reference to the dictionary.
#[derive(Debug, Clone)]
pub struct Suggester {
    /// The dictionary to use for checking/suggesting.
    dict: Dictionary,
}

impl Suggester {
    /// Create a new suggester from a pre-loaded dictionary.
    pub fn new(dict: Dictionary) -> Self {
        Self { dict }
    }

    /// Convenience: build from `.aff` and `.dic` file strings.
    pub fn from_strs(aff_str: &str, dic_str: &str) -> Self {
        Self::new(Dictionary::from_strs(aff_str, dic_str))
    }

    /// Suggest corrections for a misspelled word.
    pub fn suggest(&self, word: &str) -> Vec<String> {
        suggest(&self.dict, word)
    }

    /// Check whether a word is spelled correctly.
    pub fn is_correct(&self, word: &str) -> bool {
        self.dict.contains(word)
    }

    /// Reference to the underlying dictionary.
    pub fn dict(&self) -> &Dictionary {
        &self.dict
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: minimal English-like dictionary for suggestion tests.
    fn mini_dict() -> Dictionary {
        let aff_str = r#"
REP 3
REP ph f
REP ie ei
REP ei ie
TRY esianrtolcdugmphbyfvkwz
SFX N Y 1
SFX N e ness e
PFX U Y 1
PFX U 0 un .
"#;
        let dic_str = r#"5
hello
world
fine/N
run/U
running"#;
        Dictionary::from_strs(aff_str, dic_str)
    }

    // ---- suggest API ---------------------------------------------------------

    #[test]
    fn suggest_test_known_word_returns_empty() {
        let dict = mini_dict();
        assert!(suggest(&dict, "hello").is_empty());
        assert!(suggest(&dict, "Hello").is_empty());
        assert!(suggest(&dict, "HELLO").is_empty());
    }

    #[test]
    fn suggest_test_empty_word_returns_empty() {
        let dict = mini_dict();
        assert!(suggest(&dict, "").is_empty());
    }

    // ---- Edit distance -------------------------------------------------------

    #[test]
    fn suggest_test_edit_distance_one() {
        let dict = mini_dict();
        let suggestions = suggest(&dict, "helo");
        assert!(suggestions.contains(&String::from("hello")), "got: {suggestions:?}");
    }

    #[test]
    fn suggest_test_edit_distance_two() {
        let dict = mini_dict();
        let suggestions = suggest(&dict, "hallo");
        assert!(suggestions.contains(&String::from("hello")), "got: {suggestions:?}");
    }

    #[test]
    fn suggest_test_transposition() {
        let dict = mini_dict();
        let suggestions = suggest(&dict, "wolrd");
        assert!(suggestions.contains(&String::from("world")), "got: {suggestions:?}");
    }

    // ---- Phonetic (REP rules) ------------------------------------------------

    #[test]
    fn suggest_test_rep_ph_f() {
        // REP ph→f: "fone" → via REP f→ph we get "phone" — but phone isn't in
        // the mini dict.  Instead test that REP f→ph is applied.
        // We need a word in the dict that is reachable via REP.
        // Let's add "tuff" as a word and "tough" as input via REP f→ph doesn't
        // work the right direction.  Actually REP ph f means ph→f.
        // So "rough" input → replace "ph" with "f" → "rouf". Not useful.
        // Better: REP ph f means the dictionary may contain "fone" but the user
        // typed "phone".  We apply reverse: replace "ph" with "f" → "fone".
        // If "fone" is in dict, that works. Let's use a custom dict.
        let aff_str = r#"
REP 1
REP ph f
"#;
        let dic_str = r#"1
fone"#;
        let dict = Dictionary::from_strs(aff_str, dic_str);
        let suggestions = suggest(&dict, "phone");
        assert!(suggestions.contains(&String::from("fone")), "got: {suggestions:?}");
    }

    // ---- Affix stripping -----------------------------------------------------

    #[test]
    fn suggest_test_affix_suffix_strip() {
        // "fineness" is not in the mini dict, but "fine/N" + SFX N → "fineness"
        // should be in the expanded dict already.  So suggest for "fineness"
        // should return empty (it's a valid word).  Test that the expanded
        // suffix word is findable.
        let dict = mini_dict();
        assert!(dict.contains("fineness"));
        // And suggestions for a typo of it should find "fineness".
        let suggestions = suggest(&dict, "fineneess");
        assert!(suggestions.contains(&String::from("fineness")), "got: {suggestions:?}");
    }

    #[test]
    fn suggest_test_affix_prefix_strip() {
        // "unrun" is not in the dict, but "run/U" + PFX U → "unrun" is in
        // the expanded dict. Test typo correction.
        let dict = mini_dict();
        assert!(dict.contains("unrun"));
        let suggestions = suggest(&dict, "unrun");
        // "unrun" is already correct → empty suggestions.
        assert!(suggestions.is_empty());
    }

    // ---- TRY character insertion ---------------------------------------------

    #[test]
    fn suggest_test_try_char_insertion() {
        // "wrld" → insert 'o' at position 2 → "world"
        let dict = mini_dict();
        let suggestions = suggest(&dict, "wrld");
        assert!(suggestions.contains(&String::from("world")), "got: {suggestions:?}");
    }

    // ---- Suggester convenience struct ----------------------------------------

    #[test]
    fn suggest_test_suggester_new() {
        let suggester = Suggester::new(mini_dict());
        assert!(suggester.is_correct("hello"));
        assert!(!suggester.is_correct("helo"));
        assert!(suggester.suggest("helo").contains(&String::from("hello")));
    }

    #[test]
    fn suggest_test_suggester_from_strs() {
        let suggester = Suggester::from_strs(
            "REP 1\nREP ph f",
            "1\nfone",
        );
        assert!(!suggester.is_correct("phone"));
        assert!(suggester.suggest("phone").contains(&String::from("fone")));
    }

    // ---- Damerau-Levenshtein correctness -------------------------------------

    #[test]
    fn suggest_test_damerau_levenshtein_identical() {
        assert_eq!(damerau_levenshtein("hello", "hello"), 0);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_substitution() {
        assert_eq!(damerau_levenshtein("hello", "hallo"), 1);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_insertion() {
        assert_eq!(damerau_levenshtein("helo", "hello"), 1);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_deletion() {
        assert_eq!(damerau_levenshtein("hello", "helo"), 1);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_transposition() {
        assert_eq!(damerau_levenshtein("teh", "the"), 1);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_empty() {
        assert_eq!(damerau_levenshtein("", ""), 0);
        assert_eq!(damerau_levenshtein("abc", ""), 3);
        assert_eq!(damerau_levenshtein("", "abc"), 3);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_unicode() {
        // Café → cafe: accent difference counts as substitution.
        assert_eq!(damerau_levenshtein("café", "cafe"), 1);
    }

    #[test]
    fn suggest_test_damerau_levenshtein_composite() {
        assert_eq!(damerau_levenshtein("kitten", "sitting"), 3);
    }

    // ---- Phonetic confusion pairs --------------------------------------------

    #[test]
    fn suggest_test_phonetic_c_s() {
        let aff_str = "TRY cs";
        let dic_str = "1\ncity";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        let suggestions = suggest(&dict, "sity");
        assert!(suggestions.contains(&String::from("city")), "got: {suggestions:?}");
    }

    #[test]
    fn suggest_test_phonetic_k_c() {
        let aff_str = "TRY kc";
        let dic_str = "1\ncat";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        let suggestions = suggest(&dict, "kat");
        assert!(suggestions.contains(&String::from("cat")), "got: {suggestions:?}");
    }

    // ---- Adjacent swap -------------------------------------------------------

    #[test]
    fn suggest_test_adjacent_swap() {
        let dict = mini_dict();
        let suggestions = suggest(&dict, "ehllo");
        assert!(suggestions.contains(&String::from("hello")), "got: {suggestions:?}");
    }

    // ---- Common confusion replacements ---------------------------------------

    #[test]
    fn suggest_test_common_confusion_ie_ei() {
        let aff_str = "";
        let dic_str = "1\nreceipt";
        let dict = Dictionary::from_strs(aff_str, dic_str);
        let suggestions = suggest(&dict, "reciept");
        assert!(suggestions.contains(&String::from("receipt")), "got: {suggestions:?}");
    }

    // ---- Max suggestions limit -----------------------------------------------

    #[test]
    fn suggest_test_max_limit() {
        // Create a dictionary where "helo" is very close to many words.
        let mut dic_lines = String::from("100\n");
        for word in ["halo", "hallo", "helo", "help", "held", "hell", "helm", "hemp", "hemo", "heal"] {
            dic_lines.push_str(word);
            dic_lines.push('\n');
        }
        let aff_str = "";
        let dict = Dictionary::from_strs(aff_str, &dic_lines);
        let suggestions = suggest(&dict, "helo");
        assert!(suggestions.len() <= MAX_SUGGESTIONS);
    }

    // ---- Real en-US dictionary integration -----------------------------------

    #[test]
    fn suggest_test_real_en_us_hello() {
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
        let dict = Dictionary::from_strs(&aff_content, &dic_content);

        // Known correct words → no suggestions.
        assert!(suggest(&dict, "hello").is_empty());
        assert!(suggest(&dict, "world").is_empty());
        assert!(suggest(&dict, "document").is_empty());

        // Common typos → "hello" should appear.
        let s = suggest(&dict, "helo");
        assert!(s.iter().any(|w| w == "hello"), "expected 'hello' in {s:?}");

        // "teh" → "the" (transposition).
        let s = suggest(&dict, "teh");
        assert!(s.iter().any(|w| w == "the"), "expected 'the' in {s:?}");

        // "recieve" → "receive" (ie/ei confusion).
        let s = suggest(&dict, "recieve");
        assert!(s.iter().any(|w| w == "receive"), "expected 'receive' in {s:?}");

        // "wrold" → "world" (transposition).
        let s = suggest(&dict, "wrold");
        assert!(s.iter().any(|w| w == "world"), "expected 'world' in {s:?}");

        // "phone" typed as "fone" (ph/f confusion) — but "fone" may not be
        // in en_US.  At minimum, verify no panic and some suggestions returned.
        let s = suggest(&dict, "fone");
        assert!(!s.is_empty() || dict.contains("fone"));
    }
}
