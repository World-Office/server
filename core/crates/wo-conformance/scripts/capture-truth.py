#!/usr/bin/env python3
"""
Ground-truth capture pipeline.

Renders each .docx in a corpus through LibreOffice (headless → PDF), then
extracts precise layout data from the PDF using PyMuPDF and projects it into
the NormalizedRender JSON schema used by the conformance harness.

The truth is tagged with the LibreOffice version, page size, and timestamp.
It is the *actual* output of a real rendering engine — not synthetic, not
mocked — and it is what wo-conformance scores against.

Usage:
    python3 capture-truth.py <corpus-dir>
    python3 capture-truth.py <corpus-dir> --engine libreoffice  # default
    python3 capture-truth.py <corpus-dir> --engine word          # future: Word via COM

Phase 2 (seed):   run on the full corpus to produce initial truth files.
Phase 4 (cross):  run on any engine to produce a comparable NormalizedRender.
Phase 5 (refresh): run periodically; diff manifests to detect truth drift.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# DOCX font request extraction
# ---------------------------------------------------------------------------

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def parse_docx_requested_fonts(docx_path: str) -> list[str]:
    """Extract explicitly requested font families from a .docx file.

    Scans all w:rFonts elements in the document XML for w:ascii attributes,
    which is the primary font family request for Latin text.
    Returns a deduplicated, sorted list.
    """
    try:
        with zipfile.ZipFile(docx_path) as z:
            try:
                doc_xml = z.read("word/document.xml").decode("utf-8")
            except KeyError:
                doc_xml = ""
    except (zipfile.BadZipFile, IOError):
        return []

    fonts = set()
    # Match all w:ascii="..." attributes that appear within rFonts elements.
    # We split on <w:rFonts .../> to isolate each element's attributes.
    rfonts_pattern = re.compile(r'<(?:w:)?rFonts\b[^>]*/?>', re.IGNORECASE)
    ascii_pattern = re.compile(r'w:ascii=["\']([^"\'>]+)["\']', re.IGNORECASE)

    for rfonts_match in rfonts_pattern.finditer(doc_xml):
        element = rfonts_match.group(0)
        for am in ascii_pattern.finditer(element):
            font = am.group(1).strip()
            if font and font.lower() not in ("", "nil"):
                fonts.add(font)

    return sorted(fonts)


def map_fonts_requested_to_used(requested: list[str], used: set[str]) -> tuple[dict[str, str], list[str]]:
    """Create a requested→actually_used mapping.

    For fonts the reference engine substitutes (e.g. doc requests Calibri,
    engine uses DejaVuSerif), records the mapping. Fonts not found in the
    document are marked as unavailable.
    """
    resolved: dict[str, str] = {}
    unavailable: list[str] = []
    used_list = sorted(used)
    for req in requested:
        if req in used:
            resolved[req] = req  # no substitution
        elif not used:
            unavailable.append(req)
        else:
            # Try fuzzy name matching (e.g. "Arial" → "ArialMT",
            # "Times New Roman" → "TimesNewRomanPSMT",
            # "Courier New" → "CourierNewPSMT")
            req_normalized = req.lower().replace(" ", "")
            best_match = None
            for u in used_list:
                u_normalized = u.lower().replace(" ", "")
                if req_normalized in u_normalized or u_normalized in req_normalized:
                    best_match = u
                    break
            if best_match:
                resolved[req] = best_match
            else:
                resolved[req] = used_list[0] if len(used_list) == 1 else "(substituted)"
    return resolved, unavailable


# ---------------------------------------------------------------------------
# PDF → NormalizedRender projection
# ---------------------------------------------------------------------------

# PyMuPDF font flags
FONT_BOLD = 0x4
FONT_ITALIC = 0x2
FONT_SERIF = 0x8
FONT_MONO = 0x16  # serif | mono


def pdf_to_normalized(pdf_path: str, engine: str, engine_version: str,
                     docx_path: str | None = None) -> dict:
    """Convert a PDF into the NormalizedRender schema."""
    doc = fitz.open(pdf_path)
    pages = []
    all_fonts_used = set()
    all_fonts_requested = set()

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pw = page.rect.width
        ph = page.rect.height
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
        boxes = []

        for block in blocks:
            if block.get("type", 0) != 0:  # skip image blocks (type=1)
                continue
            lines = block.get("lines", [])
            if not lines:
                continue

            # Determine box bounds from the block's bounding box
            bbox = block.get("bbox", (0, 0, 0, 0))
            bx0, by0, bx1, by1 = bbox
            bw = bx1 - bx0
            bh = by1 - by0

            runs = []
            for line in lines:
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    font_name = span.get("font", "unknown")
                    size_pt = span.get("size", 11.0)
                    flags = span.get("flags", 0)
                    origin = span.get("origin", (0, 0))

                    is_bold = bool(flags & FONT_BOLD)
                    is_italic = bool(flags & FONT_ITALIC)
                    weight = 700 if is_bold else 400

                    all_fonts_used.add(font_name)

                    runs.append({
                        "text": text,
                        "font": font_name,
                        "size_pt": round(size_pt, 2),
                        "weight": weight,
                        "italic": is_italic,
                        "origin": {"x_pt": round(origin[0], 2), "y_pt": round(origin[1], 2)},
                    })

            if runs:
                boxes.append({
                    "kind": "paragraph",
                    "origin": {"x_pt": round(bx0, 2), "y_pt": round(by0, 2)},
                    "size": {"width_pt": round(bw, 2), "height_pt": round(bh, 2)},
                    "runs": runs,
                })

        pages.append({
            "index": page_idx,
            "size": {"width_pt": round(pw, 2), "height_pt": round(ph, 2)},
            "boxes": boxes,
        })

    doc.close()

    # Build resolved_fonts: requested from docx, used from PDF
    if docx_path:
        requested = parse_docx_requested_fonts(docx_path)
    else:
        requested = []
    used_set = all_fonts_used
    resolved_map, unavailable = map_fonts_requested_to_used(requested, used_set)

    return {
        "pages": pages,
        "resolved_fonts": {
            "requested": sorted(requested),
            "resolved": resolved_map,
            "unavailable": sorted(unavailable),
        },
        "metadata": {
            "engine": engine,
            "engine_version": engine_version,
            "captured_at": _timestamp(),
            "environment": f"PDF\u2192IR extraction via PyMuPDF {fitz.version}",
        },
    }


# ---------------------------------------------------------------------------
# LibreOffice rendering
# ---------------------------------------------------------------------------

def render_libreoffice(docx_path: str, output_dir: str) -> str:
    """Render .docx through LibreOffice headless → PDF. Returns PDF path."""
    result = subprocess.run(
        [
            "libreoffice", "--headless", "--nologo",
            "--convert-to", "pdf",
            "--outdir", output_dir,
            docx_path,
        ],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice failed for {docx_path}: {result.stderr}")
    pdf_name = Path(docx_path).stem + ".pdf"
    pdf_path = os.path.join(output_dir, pdf_name)
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Expected PDF not created: {pdf_path}")
    return pdf_path


def get_libreoffice_version() -> str:
    result = subprocess.run(
        ["libreoffice", "--version"],
        capture_output=True, text=True, timeout=30,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


# ---------------------------------------------------------------------------
# Corpus discovery + capture
# ---------------------------------------------------------------------------

DOC_EXTENSIONS = {".docx", ".docm", ".pptx", ".xlsx"}


def discover_cases(corpus_dir: str):
    """Find all documents and their (potential) truth files."""
    cases_dir = os.path.join(corpus_dir, "cases")
    cases = []
    missing = []
    if not os.path.isdir(cases_dir):
        print(f"Warning: {cases_dir} not found", file=sys.stderr)
        return cases, missing
    for name in sorted(os.listdir(cases_dir)):
        path = os.path.join(cases_dir, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in DOC_EXTENSIONS:
            continue
        stem = os.path.splitext(name)[0]
        truth_path = os.path.join(cases_dir, f"{stem}.truth.json")
        cases.append((stem, path, truth_path))
    return cases, missing


def capture_one(docx_path: str, truth_path: str, engine: str, version: str,
               tmp_dir: str, force: bool = False):
    """Capture truth for one document. Returns the NormalizedRender dict."""
    if os.path.exists(truth_path) and not force:
        with open(truth_path) as f:
            return json.load(f)

    pdf_path = render_libreoffice(docx_path, tmp_dir)
    ir = pdf_to_normalized(pdf_path, engine, version, docx_path=docx_path)

    with open(truth_path, "w") as f:
        json.dump(ir, f, indent=2)

    # Clean up temp PDF
    os.remove(pdf_path)
    return ir


def capture_corpus(corpus_dir: str, engine: str = "libreoffice", force: bool = False):
    """Capture truth for the entire corpus."""
    if engine == "libreoffice":
        version = get_libreoffice_version()
    else:
        version = "unknown"

    cases, _ = discover_cases(corpus_dir)
    if not cases:
        print("No cases found.", file=sys.stderr)
        return

    print(f"Capturing truth for {len(cases)} cases via {engine} {version} ...")
    results = []
    with tempfile.TemporaryDirectory(prefix="woconf_") as tmp_dir:
        for stem, docx_path, truth_path in cases:
            try:
                ir = capture_one(docx_path, truth_path, engine, version, tmp_dir, force)
                page_count = len(ir["pages"])
                box_count = sum(len(p["boxes"]) for p in ir["pages"])
                results.append((stem, page_count, box_count, "ok"))
                print(f"  {stem}: {page_count} page(s), {box_count} box(es)")
            except Exception as e:
                results.append((stem, 0, 0, f"FAILED: {e}"))
                print(f"  {stem}: FAILED — {e}", file=sys.stderr)

    # Update manifest
    manifest_path = os.path.join(corpus_dir, "manifest.json")
    manifest = {
        "schema_version": 1,
        "corpus_name": os.path.basename(corpus_dir),
        "truth_source": f"{engine} {version}",
        "case_count": len(cases),
        "results": [{"name": s, "pages": p, "boxes": b, "status": st} for s, p, b, st in results],
        "captured_at": _timestamp(),
        "notes": f"Truth captured from {engine} {version}. Refresh by re-running with --force.",
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nManifest written to {manifest_path}")
    failed = sum(1 for _, _, _, s in results if s != "ok")
    if failed:
        print(f"WARNING: {failed} case(s) failed.", file=sys.stderr)


def compare_engines(corpus_dir: str, engine_a: str = "wo-docx-renderer",
                    engine_b: str = "libreoffice"):
    """Phase 4: load two NormalizedRender JSON sets and produce fidelity reports.

    engine_a is scored against engine_b's truth files.
    """
    cases, _ = discover_cases(corpus_dir)
    print(f"\nComparing {engine_a} vs {engine_b} on {len(cases)} cases ...\n")

    reports = []
    for stem, docx_path, truth_path in cases:
        engine_json = os.path.join(corpus_dir, "cases", f"{stem}.engine.json")
        if not os.path.exists(engine_json) or not os.path.exists(truth_path):
            print(f"  {stem}: missing engine/truth JSON — skip")
            continue
        with open(engine_json) as f:
            engine_ir = json.load(f)
        with open(truth_path) as f:
            truth_ir = json.load(f)
        report = fidelity_report(stem, engine_ir, truth_ir)
        reports.append(report)
        _print_report(report)

    if reports:
        fids = [r["fidelity"] for r in reports]
        mean_fid = sum(fids) / len(fids)
        min_fid = min(fids)
        print(f"\n{'='*60}")
        print(f"Aggregate: {len(reports)} cases, mean fidelity={mean_fid:.4f}, min={min_fid:.4f}")

        report_path = os.path.join(corpus_dir, f"comparison-{engine_a}-vs-{engine_b}.json")
        with open(report_path, "w") as f:
            json.dump({
                "engine_a": engine_a,
                "engine_b": engine_b,
                "case_count": len(reports),
                "mean_fidelity": round(mean_fid, 4),
                "min_fidelity": round(min_fid, 4),
                "cases": reports,
            }, f, indent=2)
        print(f"Report written to {report_path}")


# ---------------------------------------------------------------------------
# Fidelity scoring (Python re-implementation of wo-conformance scoring)
# Supports two modes: box-level (for self-comparison) and run-level (for cross-engine)
# ---------------------------------------------------------------------------

GEO_TOL = 2.0
CROSS_GEO_TOL = 15.0  # Cross-engine: different engines position text differently
W_GEO = 0.30
W_TEXT = 0.30
W_STYLE = 0.25
W_FONT = 0.15


def fidelity_report(case_name: str, engine: dict, truth: dict,
                   mode: str = "cross-engine") -> dict:
    """Compute a fidelity report.

    mode="box":    Greedy nearest-neighbor box matching (self-comparison, same engine).
    mode="cross-engine":  Run-level text matching (different engines produce
                   different box segmentations but the same text content).
    """
    e_pages = engine.get("pages", [])
    t_pages = truth.get("pages", [])

    notes = []
    if len(e_pages) != len(t_pages):
        notes.append(f"page count differs: engine={len(e_pages)} truth={len(t_pages)}")

    if mode == "cross-engine":
        return _run_level_report(case_name, engine, truth, e_pages, t_pages, notes)
    else:
        return _box_level_report(case_name, engine, truth, e_pages, t_pages, notes)


def _box_level_report(case_name, engine, truth, e_pages, t_pages, notes):
    """Original box-level scoring — for self-comparison."""
    boxes_total = 0
    boxes_matched = 0
    text_matches = 0
    text_total = 0
    style_matches = 0
    style_total = 0

    comparable = min(len(e_pages), len(t_pages))
    for i in range(comparable):
        bt, bm, tm, tt, sm, st = _score_page(e_pages[i], t_pages[i], GEO_TOL)
        boxes_total += bt
        boxes_matched += bm
        text_matches += tm
        text_total += tt
        style_matches += sm
        style_total += st

    for page in t_pages[comparable:]:
        boxes_total += len(page.get("boxes", []))

    geometry = _ratio(boxes_matched, boxes_total)
    text = _ratio(text_matches, text_total)
    style = _ratio(style_matches, style_total)

    t_fonts = truth.get("resolved_fonts", {})
    e_fonts = engine.get("resolved_fonts", {})
    requested = t_fonts.get("requested", [])
    missing = [f for f in requested if e_fonts.get("resolved", {}).get(f) != f]
    missing = sorted(set(missing))
    font_cov = _ratio(len(requested) - len(missing), len(requested)) if requested else 1.0

    if missing:
        notes.append(f"font substitution / missing: {', '.join(missing)}")

    fidelity = geometry * W_GEO + text * W_TEXT + style * W_STYLE + font_cov * W_FONT

    return _make_report(case_name, engine, truth, fidelity, geometry, text,
                         style, font_cov, boxes_matched, boxes_total,
                         text_matches, text_total, style_matches, style_total,
                         missing, notes, scoring_mode="box")


def _run_level_report(case_name, engine, truth, e_pages, t_pages, notes):
    """Run-level scoring for cross-engine comparison.

    Flattens all boxes into runs per page, then matches truth runs to engine
    runs by text content (greedy left-to-right). This avoids the problem of
    different engines producing different box segmentations.
    """
    # Collect all fonts from both engines
    e_font_set = set()
    t_font_set = set()

    geo_matches = 0
    geo_total = 0
    text_matches = 0
    text_total = 0
    style_matches = 0
    style_total = 0

    comparable = min(len(e_pages), len(t_pages))
    for i in range(comparable):
        ep = e_pages[i]
        tp = t_pages[i]

        # Flatten runs per page
        e_runs = _flatten_runs(ep, e_font_set)
        t_runs = _flatten_runs(tp, t_font_set)

        # Greedy text-content matching
        used = [False] * len(e_runs)
        for tr in t_runs:
            text_total += 1
            geo_total += 1
            best_j = None
            for j, er in enumerate(e_runs):
                if used[j]:
                    continue
                if er["text"].strip() == tr["text"].strip():
                    best_j = j
                    break  # greedy left-to-right
            if best_j is not None:
                er = e_runs[best_j]
                used[best_j] = True
                text_matches += 1
                style_total += 1
                if _style_eq(tr, er):
                    style_matches += 1
                # Geometry: compare origins with relaxed tolerance
                dx = abs(er["x_pt"] - tr["x_pt"])
                dy = abs(er["y_pt"] - tr["y_pt"])
                if dx <= CROSS_GEO_TOL and dy <= CROSS_GEO_TOL:
                    geo_matches += 1

    # Handle unmatched truth pages — count runs as failures
    for i in range(comparable, len(t_pages)):
        tp = t_pages[i]
        for b in tp.get("boxes", []):
            for r in b.get("runs", []):
                text_total += 1
                geo_total += 1

    geometry = _ratio(geo_matches, geo_total)
    text = _ratio(text_matches, text_total)
    style = _ratio(style_matches, style_total)

    # Font coverage: use resolved_fonts from both engine and truth.
    # This checks whether the engine satisfied the document's REQUESTED fonts,
    # not whether it used the same names as the reference engine.
    t_rf = truth.get("resolved_fonts", {})
    e_rf = engine.get("resolved_fonts", {})
    requested = t_rf.get("requested", [])
    missing = []
    if requested:
        for req in requested:
            e_resolved = e_rf.get("resolved", {}).get(req)
            if e_resolved is None or e_resolved != req:
                missing.append(req)
        missing = sorted(set(missing))
    font_cov = _ratio(len(requested) - len(missing), len(requested)) if requested else 1.0

    if missing:
        notes.append(f"font substitution / missing: {', '.join(missing)}")

    fidelity = geometry * W_GEO + text * W_TEXT + style * W_STYLE + font_cov * W_FONT

    return _make_report(case_name, engine, truth, fidelity, geometry, text,
                         style, font_cov, geo_matches, geo_total,
                         text_matches, text_total, style_matches, style_total,
                         missing, notes, scoring_mode="run")


def _flatten_runs(page, font_set):
    """Flatten all boxes on a page into a single list of runs, recording origin."""
    runs = []
    for box in page.get("boxes", []):
        for r in box.get("runs", []):
            runs.append({
                "text": r.get("text", ""),
                "font": r.get("font", ""),
                "size_pt": r.get("size_pt", 0),
                "weight": r.get("weight", 400),
                "italic": r.get("italic", False),
                "x_pt": r.get("origin", {}).get("x_pt", 0),
                "y_pt": r.get("origin", {}).get("y_pt", 0),
            })
            font_set.add(r.get("font", ""))
    return runs


def _make_report(case_name, engine, truth, fidelity, geometry, text,
                  style, font_cov, matched, total, tm, tt, sm, st,
                  missing, notes, scoring_mode="box"):
    return {
        "case_name": case_name,
        "engine": engine.get("metadata", {}).get("engine", "unknown"),
        "engine_version": engine.get("metadata", {}).get("engine_version", ""),
        "truth_source": truth.get("metadata", {}).get("engine", "unknown"),
        "fidelity": round(fidelity, 4),
        "breakdown": {
            "geometry": round(geometry, 4),
            "text": round(text, 4),
            "style": round(style, 4),
            "font_coverage": round(font_cov, 4),
        },
        "scoring_mode": scoring_mode,
        "matched": matched,
        "total": total,
        "text_matches": tm,
        "text_total": tt,
        "style_matches": sm,
        "style_total": st,
        "missing_fonts": missing,
        "notes": notes,
    }


def _score_page(e_page: dict, t_page: dict, tol: float = GEO_TOL):
    """Score one page at box level. Returns (boxes_total, matched, text_m, text_t, style_m, style_t)."""
    t_boxes = t_page.get("boxes", [])
    e_boxes = e_page.get("boxes", [])
    bt = len(t_boxes)
    bm = 0
    tm = tt = sm = st = 0

    used = [False] * len(e_boxes)
    for tb in t_boxes:
        t_orig = tb.get("origin", {"x_pt": 0, "y_pt": 0})
        t_size = tb.get("size", {"width_pt": 0, "height_pt": 0})

        best_j = None
        best_dist = float("inf")
        for j, eb in enumerate(e_boxes):
            if used[j]:
                continue
            e_orig = eb.get("origin", {"x_pt": 0, "y_pt": 0})
            dx = e_orig["x_pt"] - t_orig["x_pt"]
            dy = e_orig["y_pt"] - t_orig["y_pt"]
            dist = (dx * dx + dy * dy) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best_j = j

        if best_j is None:
            continue
        eb = e_boxes[best_j]
        e_orig = eb.get("origin", {"x_pt": 0, "y_pt": 0})
        e_size = eb.get("size", {"width_pt": 0, "height_pt": 0})

        dx = abs(e_orig["x_pt"] - t_orig["x_pt"])
        dy = abs(e_orig["y_pt"] - t_orig["y_pt"])
        dw = abs(e_size["width_pt"] - t_size["width_pt"])
        dh = abs(e_size["height_pt"] - t_size["height_pt"])
        if dx <= tol and dy <= tol and dw <= tol and dh <= tol:
            bm += 1
            used[best_j] = True

            e_text = "".join(r.get("text", "") for r in eb.get("runs", []))
            t_text = "".join(r.get("text", "") for r in tb.get("runs", []))
            tt += 1
            if e_text == t_text:
                tm += 1

            t_runs = tb.get("runs", [])
            e_runs = eb.get("runs", [])
            for tr, er in zip(t_runs, e_runs):
                st += 1
                if (_style_eq(tr, er)):
                    sm += 1
            if len(t_runs) > len(e_runs):
                st += len(t_runs) - len(e_runs)

    return bt, bm, tm, tt, sm, st


def _style_eq(t_run: dict, e_run: dict) -> bool:
    return (
        t_run.get("font") == e_run.get("font")
        and abs(t_run.get("size_pt", 0) - e_run.get("size_pt", 0)) <= 0.5
        and t_run.get("weight", 0) == e_run.get("weight", 0)
        and t_run.get("italic", False) == e_run.get("italic", False)
    )


def _ratio(num, den):
    return num / den if den > 0 else 1.0


def _print_report(r: dict):
    b = r["breakdown"]
    mf = ", ".join(r["missing_fonts"]) if r["missing_fonts"] else ""
    print(
        f"  {r['case_name']:35s} fid={r['fidelity']:.4f}  "
        f"geo={b['geometry']:.3f} txt={b['text']:.3f} "
        f"sty={b['style']:.3f} fnt={b['font_coverage']:.3f}"
        + (f"  [{mf}]" if mf else "")
        + ("".join(f"  ⚠ {n}" for n in r["notes"] if "font" not in n))
    )


# ---------------------------------------------------------------------------
# Phase 5: regression detection
# ---------------------------------------------------------------------------

def check_regression(corpus_dir: str, threshold: float = 0.05):
    """Compare current engine output against stored truth, fail on regression."""
    reports = []
    cases, _ = discover_cases(corpus_dir)

    for stem, _, truth_path in cases:
        engine_json = os.path.join(corpus_dir, "cases", f"{stem}.engine.json")
        if not os.path.exists(engine_json) or not os.path.exists(truth_path):
            continue
        with open(engine_json) as f:
            e_ir = json.load(f)
        with open(truth_path) as f:
            t_ir = json.load(f)
        reports.append(fidelity_report(stem, e_ir, t_ir))

    if not reports:
        print("No reports to check.")
        return 0

    fids = [r["fidelity"] for r in reports]
    mean = sum(fids) / len(fids)
    worst = min(fids)
    worst_case = [r["case_name"] for r in reports if r["fidelity"] == worst][0]

    # Check for a stored baseline
    baseline_path = os.path.join(corpus_dir, "baseline.json")
    regressed = False
    if os.path.exists(baseline_path):
        with open(baseline_path) as f:
            baseline = json.load(f)
        prev_mean = baseline.get("mean_fidelity", 0)
        delta = mean - prev_mean
        if delta < -threshold:
            print(f"REGRESSION: mean fidelity dropped by {abs(delta):.4f} (threshold={threshold})")
            regressed = True
        else:
            print(f"No regression (delta={delta:+.4f}, threshold={threshold})")
    else:
        print(f"No baseline found — writing one at {baseline_path}")

    # Write/update baseline
    with open(baseline_path, "w") as f:
        json.dump({
            "mean_fidelity": round(mean, 4),
            "min_fidelity": round(worst, 4),
            "worst_case": worst_case,
            "case_count": len(reports),
            "cases": reports,
            "checked_at": _timestamp(),
        }, f, indent=2)

    print(f"Mean fidelity: {mean:.4f}, worst: {worst:.4f} ({worst_case})")
    return 1 if regressed else 0


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _timestamp():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)

    cmd = args[0]
    corpus_dir = args[1] if len(args) > 1 else "."

    if cmd == "capture":
        force = "--force" in args
        capture_corpus(corpus_dir, force=force)
    elif cmd == "compare":
        engine_a = "wo-docx-renderer"
        engine_b = "libreoffice"
        for a in args:
            if a.startswith("--engine-a="):
                engine_a = a.split("=", 1)[1]
            elif a.startswith("--engine-b="):
                engine_b = a.split("=", 1)[1]
        compare_engines(corpus_dir, engine_a, engine_b)
    elif cmd == "regression":
        threshold = 0.05
        for a in args:
            if a.startswith("--threshold="):
                threshold = float(a.split("=", 1)[1])
        rc = check_regression(corpus_dir, threshold)
        sys.exit(rc)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
