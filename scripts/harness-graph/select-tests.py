#!/usr/bin/env python3
"""Graph-driven test selection: changed files -> affected e2e tests.

Materializes the harness-graph killer query ("which tests exercise the
commands touched by this diff?") for CI. The graph (graph.json, committed by
seed.py) provides Command -> Feature <- COVERS - Test edges; the diff
provides the changed commands (data-cmd="…" / runCommand("…") tokens).

Selection rules (first match wins):
  1. register changed (features.yaml, graph.json, seed.py)   -> ALL e2e tests
  2. editor sources changed:
       - commands extractable from the diff                  -> tests covering
         features that implement those commands
       - no commands extractable (restructuring)             -> all
         command-wired tests
  3. an e2e test file changed                                -> that file
  4. anything else                                           -> no tests

Usage:
  select-tests.py                       # diff = working tree + HEAD
  select-tests.py --base origin/main    # diff = merge-base..HEAD
  select-tests.py --list                # one test file per line (default:
                                        #   single line, pytest-friendly)

Exit codes: 0 = selection computed (possibly empty), 2 = graph missing/stale.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GRAPH = HERE / "graph.json"
E2E_ROOT = HERE.parent.parent / "opencloud-docserver" / "e2e"
SERVER_ROOT = E2E_ROOT.parent.parent

DATA_CMD = re.compile(r'data-cmd="([A-Za-z0-9_-]+)"')
RUN_CMD = re.compile(r'runCommand\(\s*"([A-Za-z0-9_-]+)"')
REGISTER_FILES = {"features.yaml", "graph.json", "seed.py"}
EDITOR_FILES = {"web/editor.js", "web/index.html"}
RUST_PREFIX = "core/crates/wo-conformance"


def git_changed(base: str | None) -> list[str]:
    if base:
        cmd = ["git", "diff", "--name-only", f"{base}...HEAD"]
    else:
        cmd = ["git", "diff", "--name-only", "HEAD"]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def load_graph() -> dict:
    if not GRAPH.exists():
        print(f"error: {GRAPH} missing — run seed.py", file=sys.stderr)
        sys.exit(2)
    g = json.loads(GRAPH.read_text())
    # sanity: the committed projection must not be stale
    rc = subprocess.run(
        [sys.executable, str(HERE / "seed.py"), "--check"],
        capture_output=True, text=True,
    )
    if rc.returncode != 0:
        print("error: graph.json is stale (seed.py --check failed)", file=sys.stderr)
        sys.exit(2)
    return g


def command_to_testfiles(g: dict, commands: set[str]) -> set[Path]:
    """Command <-[:IMPLEMENTED_BY]- Feature <-[:COVERS]- Test  (file level)."""
    cmd2feature = {}
    for e in g["edges"]:
        if e["type"] != "IMPLEMENTED_BY":
            continue
        f, c = e["from"], e["to"]
        if f.startswith("F-") and c in commands:
            cmd2feature.setdefault(c, set()).add(f)

    features = set().union(*cmd2feature.values()) if cmd2feature else set()
    files: set[Path] = set()
    for e in g["edges"]:
        if e["type"] == "COVERS" and e["to"] in features:
            rel = e["from"].split("::", 1)[0]
            p = SERVER_ROOT / rel
            if p.exists() and p.parent == E2E_ROOT:
                files.add(p)
    return files


def all_e2e_tests() -> set[Path]:
    return set(E2E_ROOT.glob("test_*.py"))


def command_wired_tests(g: dict) -> set[Path]:
    commands = {
        n["id"]
        for n in g["nodes"]
        if n.get("label") == "Command"
    }
    return command_to_testfiles(g, commands)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", help="git ref to diff against (default: working tree vs HEAD)")
    ap.add_argument("--list", action="store_true", help="one path per line")
    args = ap.parse_args()

    changed = git_changed(args.base)
    if not changed:
        return 0
    g = load_graph()

    selected: set[Path] = set()

    reg_changed = {Path(c).name for c in changed} & REGISTER_FILES
    if reg_changed:
        selected = all_e2e_tests()

    if not selected:
        editor_changed = [c for c in changed if Path(c).name in {p.name for p in EDITOR_FILES}]
        if editor_changed:
            diff = subprocess.run(
                ["git", "diff", "HEAD", "--", *EDITOR_FILES],
                capture_output=True, text=True,
            ).stdout if not args.base else subprocess.run(
                ["git", "diff", f"{args.base}...HEAD", "--", *EDITOR_FILES],
                capture_output=True, text=True,
            ).stdout
            commands = set(DATA_CMD.findall(diff)) | set(RUN_CMD.findall(diff))
            if commands:
                selected = command_to_testfiles(g, commands)
            else:
                selected = command_wired_tests(g)

    if not selected:
        test_changed = {
            E2E_ROOT / Path(c).name
            for c in changed
            if (E2E_ROOT / Path(c).name).exists()
        }
        selected = {p for p in test_changed if p.exists()}

    if not selected:
        return 0

    sep = "\n" if args.list else " "
    print(sep.join(sorted(str(p) for p in selected)))
    if any(c.startswith(RUST_PREFIX) for c in changed):
        print(
            "note: wo-conformance changed — also run: cargo test -p wo-conformance",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
