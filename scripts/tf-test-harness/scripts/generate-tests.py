#!/usr/bin/env python3
"""generate-tests.py — test inventory for the World-Office docserver.

Writes ``config/tasks.json`` from what actually exists:

- unit tests      — ``pytest --collect-only`` over opencloud-docserver/tests
- e2e tests       — ``opencloud-docserver/e2e/test_*.py``
- register gates  — harness-graph drift + register resolution
- features        — the F-### register (features.yaml)

Usage:
    python3 generate-tests.py                # write config/tasks.json
    python3 generate-tests.py --check        # validate an existing file
    python3 generate-tests.py --summary      # print inventory summary

Exit codes: 0 ok, 1 failure, 2 setup error.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

HARNESS_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = HARNESS_DIR.parent.parent
DOCSERVER = REPO_DIR / "opencloud-docserver"
GRAPH_DIR = REPO_DIR / "scripts" / "harness-graph"
DEFAULT_OUTPUT = HARNESS_DIR / "config" / "tasks.json"

FID = re.compile(r"^F-\d{3}$")


def collect_unit_tests() -> list[str]:
    out = subprocess.run(
        ["uv", "run", "--frozen", "pytest", "--collect-only", "-q"],
        cwd=DOCSERVER, capture_output=True, text=True, check=True,
    ).stdout
    tests = []
    for line in out.splitlines():
        line = line.strip()
        if "::" in line and not line.startswith("="):
            tests.append(f"opencloud-docserver/tests/{line.split('::')[0]}::{line.split('::', 1)[1]}")
    return sorted(set(tests))


def collect_e2e_tests() -> list[str]:
    e2e = DOCSERVER / "e2e"
    return sorted(
        f"opencloud-docserver/e2e/{p.name}" for p in e2e.glob("test_*.py")
    )


def collect_features() -> list[str]:
    ids = sorted(set(re.findall(r"F-\d{3}", (GRAPH_DIR / "features.yaml").read_text())))
    return [i for i in ids if FID.match(i)]


def build_inventory() -> dict:
    return {
        "generated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "counts": {},
        "tasks": [],
    }


def gather() -> dict:
    inv = build_inventory()
    for kind, items in (
        ("unit", collect_unit_tests()),
        ("e2e", collect_e2e_tests()),
    ):
        inv["counts"][kind] = len(items)
        inv["tasks"] += [
            {"id": f"{kind}:{i}", "kind": kind, "target": t} for i, t in enumerate(items)
        ]
    feats = collect_features()
    inv["counts"]["features"] = len(feats)
    inv["tasks"] += [{"id": f"gate:register", "kind": "gate", "target": "check-register all"}]
    inv["tasks"] += [{"id": f"gate:graph-drift", "kind": "gate", "target": "seed.py --check"}]
    inv["counts"]["total"] = len(inv["tasks"])
    return inv


def check(path: Path) -> int:
    if not path.exists():
        print(f"Error: {path} does not exist — run generate-tests.py first", file=sys.stderr)
        return 1
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        print(f"Error: {path} is not valid JSON: {exc}", file=sys.stderr)
        return 1
    missing = {"unit", "e2e", "features", "total"} - set(data.get("counts", {}))
    if missing:
        print(f"Error: {path} missing counts: {sorted(missing)}", file=sys.stderr)
        return 1
    print(f"OK: {data['counts']['total']} tasks "
          f"({data['counts']['unit']} unit, {data['counts']['e2e']} e2e, "
          f"{data['counts']['features']} features)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="validate existing tasks.json")
    ap.add_argument("--summary", action="store_true", help="print summary only")
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()

    if args.check:
        return check(args.output)

    try:
        inv = gather()
    except FileNotFoundError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        print(f"Error: pytest collection failed:\n{exc.stderr[-500:]}", file=sys.stderr)
        return 2

    if args.summary:
        print(json.dumps(inv["counts"], indent=2))
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(inv, indent=2) + "\n")
    print(f"wrote {args.output} ({inv['counts']['total']} tasks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
