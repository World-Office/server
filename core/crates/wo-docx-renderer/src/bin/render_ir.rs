//! `wo-render-ir` — renders .docx files through the wo-docx-renderer adapter
//! and writes NormalizedRender JSON. Used by the conformance pipeline (Phase 4)
//! to produce engine output that can be diffed against LibreOffice/Word truth.
//!
//! Usage:  wo-render-ir <input.docx> <output.json>
//!         wo-render-ir <input.docx> --               # write to stdout

use std::path::PathBuf;

use wo_conformance::{RenderEngine, RenderSpec};
use wo_docx_renderer::DocxConformanceAdapter;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: wo-render-ir <input.docx> <output.json>");
        eprintln!("       wo-render-ir <input.docx> --");
        std::process::exit(2);
    }

    let input = PathBuf::from(&args[1]);
    let to_stdout = args[2] == "--";
    let output = if !to_stdout {
        PathBuf::from(&args[2])
    } else {
        PathBuf::new()
    };

    let docx = match std::fs::read(&input) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Error reading {}: {e}", input.display());
            std::process::exit(1);
        }
    };

    let adapter = DocxConformanceAdapter::default();
    let ir = match adapter.render(&docx, &RenderSpec::default()) {
        Ok(ir) => ir,
        Err(e) => {
            eprintln!("Render failed: {e}");
            std::process::exit(1);
        }
    };

    let json =
        serde_json::to_string_pretty(&ir).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"));

    if to_stdout {
        println!("{json}");
    } else if let Err(e) = std::fs::write(&output, json) {
        eprintln!("Error writing {}: {e}", output.display());
        std::process::exit(1);
    }
}
