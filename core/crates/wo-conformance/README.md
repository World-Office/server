# wo-conformance

Engine-agnostic **rendering conformance harness** for OOXML. Scores *any*
document renderer against captured ground truth, with attribution that
separates layout divergence from font substitution.

> This crate exists because "yet another OOXML engine" does not break the
> Office monopoly — a shared, honest **measurement layer** does. See
> [`plan/2026-07-27-ooxml-conformance-strategy.md`](../../../../../plan/2026-07-27-ooxml-conformance-strategy.md).

## What it does

- Defines a **normalized render IR** (`NormalizedRender`: pages → boxes → glyph
  runs + resolved-font state) that any engine can emit.
- Defines an engine-agnostic **`RenderEngine` trait** — one thin adapter makes
  an engine scorable.
- Computes a **decomposable fidelity score**: `geometry` × 0.30 + `text` × 0.30
  + `style` × 0.25 + `font_coverage` × 0.15, so a low score always says *what*
  is wrong.
- Discovers a **corpus** of `.docx` files paired with `<stem>.truth.json`.
- Captures ground truth from **LibreOffice** (PDF → PyMuPDF → NormalizedRender
  IR) and compares against any engine via box-level or run-level scoring.
- Runs in CI (GitHub Actions) on a weekly cadence with regression detection.

The IR is JSON-serializable, so ground truth is a committed artifact and reports
are machine-readable — the "open, engine-agnostic schema" that lets a critical
mass of users compare engines.

## CLI

```sh
# Score one render against ground truth (exits non-zero if < threshold)
wo-conformance diff [--cross-engine] [--threshold=0.95] <engine.json> <truth.json>

# Summarize a render (pages, boxes, runs, fonts)
wo-conformance inspect <file.json>

# Scaffold an empty corpus
wo-conformance init ./corpus

# List discovered cases + documents missing truth
wo-conformance corpus ./corpus
```

## Architecture

```
  Source .docx
       │
       ├──► wo-docx-renderer ──► NormalizedRender JSON ──┐
       │                                                   ▼
       └──► LibreOffice ──► PDF ──► NormalizedRender ──► scoring ──► CaseReport
         (headless, PyMuPDF)          (truth.json)
```

The `RenderEngine` trait (`engine.rs`) is the single extension point. The
`DocxConformanceAdapter` (`wo-docx-renderer/conformance.rs`) implements it by
projecting the renderer's layout IR into `NormalizedRender` before
rasterization.

## Corpus

30 real `.docx` files in `corpus/cases/` covering paragraphs, bold/italic,
four font families, tables, page breaks, multi-page, headings, alignment,
indentation, spacing, mixed fonts, size runs, and empty documents. Truth
captured from LibreOffice 26.2.4 headless.

See [`corpus/README.md`](corpus/README.md) for structure and refresh instructions.

## Scoring modes

| Mode | Matching | Use case |
|------|----------|----------|
| **Box-level** | Greedy nearest-neighbor by origin (tol=2pt) | Self-comparison, same engine |
| **Run-level** | Text-content matching (tol=15pt) | Cross-engine (different box segmentation) |

Box-level is used by the Rust `compute_fidelity()` and the Rust CLI.
Run-level is used by the Python `capture-truth.py compare` command.
The `--cross-engine` flag in the CLI switches to run-level matching.

## Full pipeline

```sh
# Generate corpus → capture truth from LO → render → compare → regression check
./scripts/run-pipeline.sh --force

# Or step by step:
python3 scripts/generate-corpus.py corpus/cases
python3 scripts/capture-truth.py capture corpus --force
cargo run -p wo-docx-renderer --bin wo-render-ir -- <docx> <engine.json>
python3 scripts/capture-truth.py compare corpus
python3 scripts/capture-truth.py regression corpus --threshold=0.05
```

## Status

All phases complete. Roadmap in the strategy doc §6:

| Phase | Status |
|---|---|
| 0 — IR + scoring + CLI scaffold | ✅ this crate |
| 1 — `wo-docx-renderer` adapter | ✅ `DocxConformanceAdapter` |
| 2 — Seed corpus + captured truth | ✅ 30 cases, LO 26.2.4 truth |
| 3 — Attribution validation | ✅ 14 scoring tests |
| 4 — Cross-engine comparison | ✅ Python pipeline + Rust CLI |
| 5 — Continuous ground truth | ✅ CI workflow + `run-pipeline.sh` |
