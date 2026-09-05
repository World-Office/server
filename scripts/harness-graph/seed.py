#!/usr/bin/env python3
"""Compile the feature register + repo inventory into the harness graph.

The graph is the traceability backbone of the OnlyOffice-parity harness:
Features ↔ Surfaces ↔ Commands ↔ Tests. Repo files are the source of truth;
graph.json is a committed projection; Neo4j (optional) is a query engine.

Usage:
  seed.py                     # regenerate graph.json (exit 1 on semantic change without update)
  seed.py --check             # CI drift gate: regenerate, diff against committed graph.json
  seed.py --report            # print coverage gaps + parity summary
  seed.py --cypher            # emit Cypher (constraints + MERGEs) for Neo4j instead of writing

Graph schema (v1):
  (:Feature {id, area, name, parity, fidelity})
  (:Surface {id, kind, source})
  (:Command {id, source})
  (:Test    {id, path, layer})
  (:Divergence {feature, justification})
  (Feature)-[:HAS_SURFACE]->(Surface)-[:TRIGGERS]->(Command)
  (Feature)-[:IMPLEMENTED_BY]->(Command)
  (Test)-[:COVERS]->(Feature)

Conventions:
  - A pytest test covers a feature by containing the marker/annotation `F-###`
    anywhere in the test file (e.g. `@pytest.mark.F-010` or a comment).
  - Commands are auto-inventoried from `data-cmd="…"` (index.html) and
    `runCommand("…")` string literals (editor.js).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent.parent
DEFAULTS = {
    "features": HERE / "features.yaml",
    "editor_js": SERVER / "opencloud-docserver" / "web" / "editor.js",
    "index_html": SERVER / "opencloud-docserver" / "web" / "index.html",
    "pytest_roots": [
        SERVER / "opencloud-docserver" / "e2e",
        SERVER / "opencloud-docserver" / "tests",  # unit tests may claim coverage too
    ],
    "out": HERE / "graph.json",
}

F_ID = re.compile(r"\bF-\d{3}\b")
DATA_CMD = re.compile(r'data-cmd="([A-Za-z0-9_-]+)"')
RUN_CMD = re.compile(r'runCommand\(\s*"([A-Za-z0-9_-]+)"')


def build_graph(paths: dict[str, Path]) -> dict:
    features = yaml.safe_load(paths["features"].read_text())["features"]

    nodes: list[dict] = []
    edges: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def node(label: str, node_id: str, **props) -> None:
        key = (label, node_id)
        if key in seen:
            return
        seen.add(key)
        nodes.append({"label": label, "id": node_id, **props})

    def edge(src: str, dst: str, kind: str) -> None:
        e = {"from": f"{src}", "to": f"{dst}", "type": kind}
        if e not in edges:
            edges.append(e)

    # ── inventory: commands (editor.js) + surfaces (index.html) ──────────────
    js = paths["editor_js"].read_text()
    html = paths["index_html"].read_text()

    js_cmds = {
        cmd: f"editor.js:runCommand('{cmd}')"
        for cmd in sorted(set(RUN_CMD.findall(js)) | set(DATA_CMD.findall(html)))
    }
    html_cmds = set(DATA_CMD.findall(html))
    for cmd, src in js_cmds.items():
        node("Command", cmd, source=src)
    for cmd in sorted(html_cmds):
        node("Surface", f"toolbar:{cmd}", kind="toolbar-button", source="index.html")
        edge(f"toolbar:{cmd}", cmd, "TRIGGERS")

    # ── inventory: pytest tests + F-marker coverage ──────────────────────────
    covers: dict[str, set[str]] = defaultdict(set)  # feature -> test ids
    for root in paths["pytest_roots"]:
        if not root.exists():
            continue
        for path in sorted(root.glob("test_*.py")):
            text = path.read_text()
            rel = str(path.relative_to(SERVER))
            for name in re.findall(r"^def (test_[A-Za-z0-9_]+)", text, re.M):
                tid = f"{rel}::{name}"
                node("Test", tid, path=rel, layer="e2e")
                for fid in set(F_ID.findall(text)):
                    covers[fid].add(tid)

    # ── features ─────────────────────────────────────────────────────────────
    known_cmds = set(js_cmds)
    missing_impl: list[str] = []
    for f in features:
        fid = f["id"]
        node(
            "Feature",
            fid,
            area=f["area"],
            name=f["name"],
            parity=f["parity"],
            fidelity=f["fidelity"],
        )
        for surf in f.get("surfaces", []):
            node("Surface", surf, kind="declared", source="features.yaml")
            edge(fid, surf, "HAS_SURFACE")
        for cmd in f.get("commands", []):
            if cmd not in known_cmds:
                missing_impl.append(f"{fid}: command '{cmd}' not found in editor.js/index.html")
                continue
            edge(fid, cmd, "IMPLEMENTED_BY")
        for tid in sorted(covers.get(fid, ())):
            edge(tid, fid, "COVERS")
        for div in f.get("divergence", []):
            node("Divergence", f"{fid}:{div['ref']}", justification=div["justification"])

    return {
        "version": 1,
        "stats": {
            "features": sum(1 for n in nodes if n["label"] == "Feature"),
            "commands": sum(1 for n in nodes if n["label"] == "Command"),
            "surfaces": sum(1 for n in nodes if n["label"] == "Surface"),
            "tests": sum(1 for n in nodes if n["label"] == "Test"),
            "edges": len(edges),
        },
        "nodes": nodes,
        "edges": edges,
    }


def canonical(g: dict) -> str:
    """generated_at-independent form for drift checks."""
    return json.dumps(g, sort_keys=True, indent=1)


def report(g: dict) -> str:
    feats = [n for n in g["nodes"] if n["label"] == "Feature"]
    covered = {e["to"] for e in g["edges"] if e["type"] == "COVERS"}
    by_area: dict[str, list[dict]] = defaultdict(list)
    for f in feats:
        by_area[f["area"]].append(f)

    lines = ["", "parity coverage by area (features with ≥1 covering test):"]
    for area in sorted(by_area):
        fs = by_area[area]
        done = sum(1 for f in fs if f["id"] in covered)
        bar = "#" * done + "." * (len(fs) - done)
        lines.append(f"  {area:<14} {bar} {done}/{len(fs)}")

    gaps = [f for f in feats if f["id"] not in covered]
    lines.append(f"\nuncovered features ({len(gaps)}):")
    for f in gaps:
        lines.append(f"  {f['id']}  [{f['parity']:<7}] {f['area']:<12} {f['name']}")
    return "\n".join(lines)


def cypher(g: dict) -> str:
    out = ["// constraints", ""]
    for label in ("Feature", "Surface", "Command", "Test", "Divergence"):
        out.append(f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE;")
    out.append("\n// nodes")
    for n in g["nodes"]:
        props = {k: v for k, v in n.items() if k != "label"}
        body = ", ".join(
            f"{k}: {json.dumps(v)}" for k, v in props.items()
        )
        out.append(f"MERGE (n:{n['label']} {{id: {json.dumps(n['id'])}}}) SET n += {{{body}}};")
    out.append("\n// edges")
    for e in g["edges"]:
        out.append(
            f"MATCH (a {{id: {json.dumps(e['from'])}}}), (b {{id: {json.dumps(e['to'])}}}) "
            f"MERGE (a)-[:{e['type']}]->(b);"
        )
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="drift gate: compare against committed graph.json")
    ap.add_argument("--report", action="store_true", help="print coverage gaps + parity summary")
    ap.add_argument("--cypher", action="store_true", help="emit Cypher to stdout instead of writing graph.json")
    args = ap.parse_args()

    g = build_graph({
        k: Path(v) if not isinstance(v, list) else [Path(p) for p in v]
        for k, v in DEFAULTS.items()
    })
    g["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if args.cypher:
        print(cypher(g))
        return 0

    if args.check:
        committed = json.loads(DEFAULTS["out"].read_text()) if DEFAULTS["out"].exists() else None
        if committed is None:
            print(f"FAIL: {DEFAULTS['out']} missing — commit a fresh graph.json", file=sys.stderr)
            return 1
        stale = {k: v for k, v in g.items() if k != "generated_at"}
        old = {k: v for k, v in committed.items() if k != "generated_at"}
        if stale != old:
            print("FAIL: graph.json is stale — run `seed.py` and commit (recapture-as-PR, never silent recapture)", file=sys.stderr)
            return 1
        print(f"OK: graph.json in sync ({g['stats']})")
        return 0

    DEFAULTS["out"].write_text(canonical(g) + "\n")
    print(f"wrote {DEFAULTS['out']} ({g['stats']})")
    if args.report:
        print(report(g))
    return 0


if __name__ == "__main__":
    sys.exit(main())
