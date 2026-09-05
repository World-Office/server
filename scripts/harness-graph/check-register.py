#!/usr/bin/env python3
"""check-register.py — gate: features resolved by coverage OR divergence.

Usage:
  check-register.py F-019 F-020 ...

Exit 0 iff every listed F-id is EITHER covered by at least one COVERS edge
in graph.json (i.e. a tagged test claims it) OR carries a `divergence:`
entry in features.yaml (i.e. the gap is documented, not silent).

Designed for taskfleet acceptance gates and CI.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    ids = [a for a in sys.argv[1:] if a.startswith("F-")]
    if not ids:
        print("usage: check-register.py F-xxx [F-yyy ...]", file=sys.stderr)
        return 2

    g = json.loads((HERE / "graph.json").read_text())
    covered = {e["to"] for e in g["edges"] if e["type"] == "COVERS"}

    reg = (HERE / "features.yaml").read_text()
    # one block per feature: from '  - {id: F-xxx' up to the next feature id
    blocks = re.split(r"(?=^  - \{id: F-)", reg, flags=re.M)
    div = set()
    for b in blocks:
        m = re.match(r"  - \{id: (F-\d+)", b)
        if m and "divergence:" in b:
            div.add(m.group(1))

    unresolved = [i for i in ids if i not in covered and i not in div]
    if unresolved:
        print(f"UNRESOLVED (no COVERS edge, no divergence entry): {unresolved}")
        return 1
    both = covered & div & set(ids)
    only_cov = [i for i in ids if i in covered and i not in div]
    only_div = [i for i in ids if i in div and i not in covered]
    print(
        f"OK: {len(only_cov)} covered, {len(only_div)} divergence-documented"
        + (f", {len(both)} both" if both else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
