#!/usr/bin/env python3
"""tools/parity/react-deficit.py — OO-parity gate for the React ribbon spec.

Joins the vendored OnlyOffice ribbon-label truth (oo-ribbon-labels.json,
extracted from the wo-test-harness rig census of real OnlyOffice) against
packages/editor-common/src/ribbon/specs/word-ribbon.ts by normalized label.

Modes:
  (no args)   print the per-tab deficit report (informational)
  --gate --tab home   exit 0 iff NO tab-local missing controls remain for home
  --gate --tab all    exit 0 iff every tab is clean

Globals (quick-access controls censused in >= GLOBAL_MIN of 13 OO tabs,
e.g. Copy/Paste/Cut/CopyStyle/IncFont/DecFont) are deduped and listed once.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = HERE.parent.parent / "packages/editor-common/src/ribbon/specs/word-ribbon.ts"
LABELS = HERE / "oo-ribbon-labels.json"
GLOBAL_MIN = 8


def norm(label: str) -> str:
    s = re.sub(r"\(.*?\)", "", label)          # strip "(Ctrl+Insert)" hints
    return re.sub(r"[^a-z0-9]", "", s.lower())  # space/punct-insensitive key


def deficits():
    oo = json.loads(LABELS.read_text())["tabs"]
    spec_labels = {norm(m) for m in re.findall(r'label:\s*"([^"]+)"', SPEC.read_text())}
    counts = Counter(norm(l) for labels in oo.values() for l in labels)
    out = {}
    for tab, labels in oo.items():
        missing = []
        for l in labels:
            n = norm(l)
            if not n or n in spec_labels or counts[n] >= GLOBAL_MIN or n in [norm(x) for x in missing]:
                continue
            missing.append(l)
        if missing:
            out[tab] = missing
    return out, sorted(n for n, c in counts.items() if c >= GLOBAL_MIN)


def main():
    args = sys.argv[1:]
    gate = "--gate" in args
    tab = args[args.index("--tab") + 1] if "--tab" in args else None
    missing, globals_ = deficits()
    if not gate:
        for t, m in missing.items():
            print(f"  {t:14} missing {len(m):3}: {'; '.join(m[:8])}{' …' if len(m) > 8 else ''}")
        print(f"globals (deduped, {len(globals_)}): {'; '.join(globals_)}")
        return 0
    if tab == "all":
        if missing:
            print(f"PARITY FAIL — {sum(len(m) for m in missing.values())} missing across {len(missing)} tabs")
            for t, m in missing.items():
                print(f"  {t}: {'; '.join(m)}")
            return 1
        print("PARITY PASS — every OO tab-local control present in the spec")
        return 0
    if tab not in missing:
        print(f"PARITY PASS — {tab}: no tab-local missing controls")
        return 0
    print(f"PARITY FAIL — {tab} still missing: {'; '.join(missing[tab])}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
