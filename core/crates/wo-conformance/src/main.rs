//! `wo-conformance` CLI.
//!
//! Immediately useful before any engine adapter exists: you can produce a
//! [`NormalizedRender`] JSON from *any* engine (via a thin adapter) and:
//!
//!   wo-conformance diff <engine.json> <truth.json>   # score fidelity
//!   wo-conformance inspect <file.json>               # summarize a render
//!   wo-conformance init <corpus-dir>                 # scaffold a corpus
//!
//! Engine adapters (e.g. wo-docx-renderer) and corpus runs land in later phases.

use std::path::Path;
use std::process::ExitCode;

use serde_json::Value;

use wo_conformance::{
    compute_fidelity, compute_fidelity_cross_engine, discover_corpus, CorpusManifest,
    GroundTruthFile, NormalizedRender, TRUTH_SCHEMA_VERSION,
};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        usage(&args[0]);
        return ExitCode::from(2);
    }
    let code = match args[1].as_str() {
        "diff" => cmd_diff(&args[2..]),
        "inspect" => cmd_inspect(&args[2..]),
        "init" => cmd_init(&args[2..]),
        "corpus" => cmd_corpus(&args[2..]),
        "-h" | "--help" | "help" => {
            usage(&args[0]);
            0
        }
        other => {
            eprintln!("unknown command: {other}");
            usage(&args[0]);
            1
        }
    };
    ExitCode::from(code as u8)
}

fn usage(prog: &str) {
    eprintln!(
        "wo-conformance — OOXML rendering conformance harness\n\n\
         USAGE:\n  \
         {prog} diff [--cross-engine] [--threshold=0.95] <engine.json> <truth.json>\n\
         {prog} inspect <file.json>               Summarize a NormalizedRender\n  \
         {prog} init <corpus-dir>                 Scaffold an empty corpus\n  \
         {prog} corpus <corpus-dir>               List discovered cases + missing truth\n\n\
         A render JSON is either a bare NormalizedRender or a GroundTruthFile wrapper."
    );
}

/// Load a `NormalizedRender` from a JSON file, accepting either a bare render
/// or a `GroundTruthFile` wrapper. Returns the render and a source label.
fn load_render(path: &Path) -> Result<(NormalizedRender, String), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let v: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("parse {}: {e}", path.display()))?;
    if v.get("render").is_some() {
        let truth: GroundTruthFile = serde_json::from_value(v)
            .map_err(|e| format!("parse GroundTruthFile {}: {e}", path.display()))?;
        if truth.schema_version > TRUTH_SCHEMA_VERSION {
            return Err(format!(
                "schema version mismatch in {}: got {}, max supported {}",
                path.display(),
                truth.schema_version,
                TRUTH_SCHEMA_VERSION
            ));
        }
        Ok((truth.render, truth.truth_captured_from))
    } else {
        let r: NormalizedRender = serde_json::from_value(v)
            .map_err(|e| format!("parse NormalizedRender {}: {e}", path.display()))?;
        Ok((r, String::new()))
    }
}

fn cmd_diff(args: &[String]) -> i32 {
    let mut threshold = 0.95;
    let mut cross_engine = false;
    let mut paths = Vec::new();

    for arg in args.iter() {
        match arg.as_str() {
            "--cross-engine" | "-c" => cross_engine = true,
            _ if arg.starts_with("--threshold=") => {
                if let Some(t) = arg.strip_prefix("--threshold=") {
                    threshold = t.parse().unwrap_or(0.95);
                }
            }
            _ => paths.push(arg.clone()),
        }
    }

    if paths.len() != 2 {
        eprintln!(
            "diff expects 2 arguments: <engine.json> <truth.json>\n  \
             options: --cross-engine  --threshold=0.95"
        );
        return 2;
    }
    let (engine, _) = match load_render(Path::new(&paths[0])) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let (truth, truth_src) = match load_render(Path::new(&paths[1])) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };

    let report = if cross_engine {
        compute_fidelity_cross_engine("cli-diff", &engine, &truth)
    } else {
        compute_fidelity("cli-diff", &engine, &truth)
    };

    print_human(&report, &truth_src);
    eprintln!("\njson:");
    println!(
        "{}",
        serde_json::to_string_pretty(&report).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
    );
    if report.fidelity >= threshold {
        0
    } else {
        1
    }
}

fn cmd_inspect(args: &[String]) -> i32 {
    if args.len() != 1 {
        eprintln!("inspect expects exactly 1 argument: <file.json>");
        return 2;
    }
    let (render, src) = match load_render(Path::new(&args[0])) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let total_boxes: usize = render.pages.iter().map(|p| p.boxes.len()).sum();
    let total_runs: usize = render
        .pages
        .iter()
        .map(|p| p.boxes.iter().map(|b| b.runs.len()).sum::<usize>())
        .sum();
    println!(
        "engine: {} {}\nsource: {}\npages: {}\nboxes: {}\nruns:  {}\nfonts requested: {} | substituted/unavailable: {}\nmetadata env: {}",
        render.metadata.engine,
        render.metadata.engine_version,
        if src.is_empty() { "(none)" } else { &src },
        render.pages.len(),
        total_boxes,
        total_runs,
        render.resolved_fonts.requested.len(),
        render.resolved_fonts.substitution_count(),
        render.metadata.environment,
    );
    0
}

fn cmd_init(args: &[String]) -> i32 {
    if args.len() != 1 {
        eprintln!("init expects exactly 1 argument: <corpus-dir>");
        return 2;
    }
    let dir = Path::new(&args[0]);
    if let Err(e) = std::fs::create_dir_all(dir.join("cases")) {
        eprintln!("create {}: {e}", dir.display());
        return 1;
    }
    let manifest = CorpusManifest {
        schema_version: TRUTH_SCHEMA_VERSION,
        corpus_name: dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed")
            .to_string(),
        truth_source: String::new(),
        notes: "Add .docx files and paired <stem>.truth.json into cases/. \
                Truth is captured from Microsoft Word (see strategy doc §5)."
            .to_string(),
    };
    let manifest_path = dir.join("manifest.json");
    if manifest_path.exists() {
        eprintln!(
            "manifest already exists at {}, leaving untouched",
            manifest_path.display()
        );
    } else if let Err(e) = std::fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).unwrap(),
    ) {
        eprintln!("write {}: {e}", manifest_path.display());
        return 1;
    }
    let readme = dir.join("README.md");
    if !readme.exists() {
        let _ = std::fs::write(
            &readme,
            "# Conformance corpus\n\nSee `plan/2026-07-27-ooxml-conformance-strategy.md`.\n",
        );
    }
    println!("scaffolded corpus at {}", dir.display());
    0
}

fn cmd_corpus(args: &[String]) -> i32 {
    if args.len() != 1 {
        eprintln!("corpus expects exactly 1 argument: <corpus-dir>");
        return 2;
    }
    let (cases, missing) = discover_corpus(Path::new(&args[0]));
    println!("cases: {}", cases.len());
    for c in &cases {
        println!("  {}  <-  {}", c.name, c.input_path.display());
    }
    if !missing.is_empty() {
        println!("\nmissing ground truth for {} document(s):", missing.len());
        for m in &missing {
            println!("  {}", m.display());
        }
    }
    0
}

fn print_human(report: &wo_conformance::CaseReport, truth_src: &str) {
    println!(
        "case: {}\nfidelity: {:.4}  (engine {} {} vs truth {})\n\
         geometry : {:.3}  [{}/{} boxes]\n\
         text     : {:.3}  [{}/{} matched boxes]\n\
         style    : {:.3}  [{}/{} runs]\n\
         fonts    : {:.3}  [{} substituted/missing{}]",
        report.case_name,
        report.fidelity,
        report.engine,
        report.engine_version,
        if truth_src.is_empty() {
            "(unknown)"
        } else {
            truth_src
        },
        report.breakdown.geometry,
        report.boxes_matched,
        report.boxes_total,
        report.breakdown.text,
        report.text_matches,
        report.text_total,
        report.breakdown.style,
        report.style_matches,
        report.style_total,
        report.breakdown.font_coverage,
        report.font_substitutions,
        if report.missing_fonts.is_empty() {
            String::new()
        } else {
            format!(": {}", report.missing_fonts.join(", "))
        },
    );
    if !report.notes.is_empty() {
        eprintln!("notes:");
        for n in &report.notes {
            eprintln!("  - {n}");
        }
    }
}
