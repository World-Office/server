//! Ground truth and corpus model.
//!
//! Ground truth is a [`NormalizedRender`] captured from Microsoft Word (see
//! strategy doc §5), stored as versioned JSON alongside the source document.
//! The harness compares engine output against these artifacts — it never
//! re-derives truth from the spec, because the spec is not what Word does.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::model::NormalizedRender;

/// Schema version for ground-truth artifacts. Bumped on breaking IR changes.
pub const TRUTH_SCHEMA_VERSION: u32 = 1;

/// A captured ground-truth file on disk. Wraps the IR with provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundTruthFile {
    pub schema_version: u32,
    /// The Word build / environment truth was captured from.
    pub truth_captured_from: String,
    /// ISO-8601 capture timestamp.
    pub captured_at: String,
    pub render: NormalizedRender,
}

/// One conformance case: a source document paired with its ground truth.
#[derive(Debug, Clone)]
pub struct ConformanceCase {
    /// Human-readable name (typically the file stem).
    pub name: String,
    /// Path to the source document (`.docx`, etc.).
    pub input_path: PathBuf,
    /// Path to the paired ground-truth IR JSON.
    pub truth_path: PathBuf,
}

/// The expected layout of a corpus directory:
///
/// ```text
/// corpus/
/// ├── manifest.json          # CorpusManifest
/// ├── cases/
/// │   ├── memo.docx
/// │   ├── memo.truth.json
/// │   ├── report.docx
/// │   └── report.truth.json
/// └── README.md
/// ```
///
/// A case is the pair `<stem>.<ext>` + `<stem>.truth.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorpusManifest {
    pub schema_version: u32,
    pub corpus_name: String,
    /// Engine name/version truth was captured from (e.g. Word build).
    pub truth_source: String,
    /// Free-form notes (coverage, licensing, refresh cadence).
    pub notes: String,
}

impl Default for CorpusManifest {
    fn default() -> Self {
        Self {
            schema_version: TRUTH_SCHEMA_VERSION,
            corpus_name: "unnamed".to_string(),
            truth_source: String::new(),
            notes: String::new(),
        }
    }
}

/// Discover conformance cases in a corpus directory.
///
/// Walks `<corpus>/cases/` and pairs each document with its `<stem>.truth.json`.
/// Documents are detected by extension; truth files are excluded as inputs.
/// Missing truth for a document is *not* fatal — the case is reported in the
/// returned `(cases, missing)` so the caller can decide.
pub fn discover_corpus(corpus_dir: &Path) -> (Vec<ConformanceCase>, Vec<PathBuf>) {
    let mut cases = Vec::new();
    let mut missing = Vec::new();

    let cases_dir = corpus_dir.join("cases");
    let entries = match std::fs::read_dir(&cases_dir) {
        Ok(e) => e,
        Err(_) => return (cases, missing),
    };

    let doc_exts = ["docx", "docm", "pptx", "xlsx"];
    for ent in entries.flatten() {
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !doc_exts.contains(&ext.to_ascii_lowercase().as_str()) {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let truth_path = cases_dir.join(format!("{stem}.truth.json"));
        if truth_path.exists() {
            cases.push(ConformanceCase {
                name: stem,
                input_path: path,
                truth_path,
            });
        } else {
            missing.push(path);
        }
    }

    cases.sort_by(|a, b| a.name.cmp(&b.name));
    missing.sort();
    (cases, missing)
}
