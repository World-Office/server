//! wo-spell: Hunspell .aff/.dic parser and spellcheck engine
//!
//! This crate provides parsing for Hunspell affinity files (.aff) and dictionary files (.dic),
//! supporting FLAG, PFX, SFX, and REP entries as defined in the Hunspell format specification.

pub mod aff;
pub mod error;
pub mod hyphenate;

pub use aff::{AffixFile, Flag, Prefix, Replacement, Suffix};
pub use error::AffParseError;
pub use hyphenate::{HyphenationDict, HyphenParseError, HyphenPoint, Hyphenator};
