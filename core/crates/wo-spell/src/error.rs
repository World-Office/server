//! Error types for .aff file parsing

use thiserror::Error;

/// Errors that can occur during .aff file parsing
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum AffParseError {
    /// Invalid or malformed line in .aff file
    #[error("Invalid line format at line {line}: {reason}")]
    InvalidLine { line: usize, reason: String },

    /// Unknown or unsupported directive
    #[error("Unknown directive '{directive}' at line {line}")]
    UnknownDirective { line: usize, directive: String },

    /// Invalid flag character
    #[error("Invalid flag character '{char}' at line {line}")]
    InvalidFlag { line: usize, char: char },

    /// Missing required field in a directive
    #[error("Missing required field in {directive} at line {line}")]
    MissingField { line: usize, directive: String },

    /// Duplicate flag definition
    #[error("Duplicate flag '{flag}' at line {line}")]
    DuplicateFlag { line: usize, flag: char },

    /// Invalid regex pattern in condition
    #[error("Invalid condition pattern '{pattern}' at line {line}")]
    InvalidPattern { line: usize, pattern: String },

    /// Prefix or suffix name already defined
    #[error("Duplicate {prefix_or_suffix} name '{name}' at line {line}")]
    DuplicateAffixName {
        line: usize,
        prefix_or_suffix: &'static str,
        name: String,
    },

    /// Replacement rule already defined
    #[error("Duplicate REP rule '{from}' at line {line}")]
    DuplicateReplacement { line: usize, from: String },

    /// File encoding issue
    #[error("Encoding error: {0}")]
    EncodingError(String),
}

impl AffParseError {
    /// Returns the line number where the error occurred
    pub fn line(&self) -> Option<usize> {
        match self {
            AffParseError::InvalidLine { line, .. } => Some(*line),
            AffParseError::UnknownDirective { line, .. } => Some(*line),
            AffParseError::InvalidFlag { line, .. } => Some(*line),
            AffParseError::MissingField { line, .. } => Some(*line),
            AffParseError::DuplicateFlag { line, .. } => Some(*line),
            AffParseError::InvalidPattern { line, .. } => Some(*line),
            AffParseError::DuplicateAffixName { line, .. } => Some(*line),
            AffParseError::DuplicateReplacement { line, .. } => Some(*line),
            AffParseError::EncodingError(_) => None,
        }
    }
}
