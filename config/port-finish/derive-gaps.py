#!/usr/bin/env python3
"""derive-gaps.py — turn coverage-check output into fleet tasks.

Reads the fresh react census (census/census/census-react-deep.json in the
harness), runs coverage logic, and appends idempotent fill-tasks (PF-GAP-n)
to config/port-finish/tasks.json for every tab with undeclared missing
labels. af hot-reloads the file within one poll cycle. Safe to re-run:
existing PF-GAP ids and tasks already covering a tab are skipped.

Also honors hand-written drop-ins: config/port-finish/tasks.d/*.json files
(each one task object) are merged in — the on-the-fly injection path.
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SERVER = Path("/home/weiss/git/World-Office/server")
HARNESS = Path("/home/weiss/git/World-Office/wo-test-harness")
CAMP = SERVER / "config" / "port-finish"
CHECK = HARNESS / "census" / "react-e2e" / "coverage-check.py"

REACT_GATE = (
    "cd apps/web/apps/documenteditor-react && ln -sfn "
    "/home/weiss/git/World-Office/server/apps/web/apps/documenteditor-react/node_modules "
    "node_modules && timeout 300 npx vitest run 2>&1 | tee /tmp/vitest-out.log | tail -3; ! grep -qE 'Test Files +[1-9][0-9]* failed|Tests +[1-9][0-9]* failed' /tmp/vitest-out.log"
)

FACTS = (
    "VERIFIED FACTS (supervisor): react app at apps/web/apps/documenteditor-react; "
    "vitest; worktree has no node_modules (gate symlinks the main checkout). "
    "Ribbon buttons must expose the label via aria-label||title||textContent "
    "(exact trimmed label). E2E + coverage proof runs in the supervisor's "
    "master gate after merge. i18n: follow the catalog-key pattern of 1cc342147. "
    "WORKTREE DISCIPLINE: edit only inside YOUR worktree (state/worktrees/...); the main checkout is the merge target — never edit it (node_modules symlink is dependencies only)."
)


def coverage_text() -> str:
    try:
        return subprocess.run(
            [sys.executable, str(CHECK)], capture_output=True, text=True, timeout=60
        ).stdout
    except Exception as e:  # noqa: BLE001
        print(f"derive: coverage-check failed: {e}")
        return ""


def parse_gaps(text: str):
    """Returns [(tab, [labels…])] for 'tab: N% — missing: a, b' lines."""
    gaps = []
    for m in re.finditer(r"^  ([A-Za-z &]+): \d+\.\d+% — missing: (.+)$", text, re.M):
        tab = m.group(1).strip()
        labels = [l.strip().replace("\n", " ") for l in m.group(2).split(",") if l.strip()]
        gaps.append((tab, labels))
    return gaps


def main() -> int:
    tasks_path = CAMP / "tasks.json"
    tasks = json.loads(tasks_path.read_text())
    known = {t["id"] for t in tasks["tasks"]}
    covered_tabs = {
        tuple(t.get("touch", [])) for t in tasks["tasks"]
    }
    n = 0
    for tab, labels in parse_gaps(coverage_text()):
        # skip tabs an existing task already targets (title or note mentions it)
        if any(tab.lower() in (t.get('title', '') + ' '.join(t.get('note', ''))).lower()
               for t in tasks['tasks']):
            continue
        n += 1
        tid = f"PF-GAP-{n}"
        if tid in known:
            continue
        tasks["tasks"].append({
            "id": tid, "repo": "server", "deps": [], "priority": 5,
            "title": f"Parity fill: {tab} — {', '.join(labels[:4])}{' …' if len(labels) > 4 else ''}",
            "scope": ["apps/web/apps/documenteditor-react/src/"],
            "touch": [f"apps/web/apps/documenteditor-react/src/__tests__/gap-{n}.test.ts"],
            "accept": REACT_GATE,
            "note": (
                f"Auto-derived {datetime.now(timezone.utc):%FT%TZ} by derive-gaps.py from "
                f"coverage-check. OO golden labels missing on tab '{tab}': "
                f"{json.dumps(labels)}. Implement each control minimal-viable and honest "
                f"(no dead buttons; disabled-with-reason if engine-blocked). "
                f"Test file asserts the exact labels render + handlers registered. {FACTS}"
            ),
        })
        print(f"derive: +{tid} {tab}: {len(labels)} labels")

    # hand-written drop-ins (on-the-fly injection path)
    dropdir = CAMP / "tasks.d"
    if dropdir.is_dir():
        for f in sorted(dropdir.glob("*.json")):
            try:
                t = json.loads(f.read_text())
            except json.JSONDecodeError as e:
                print(f"derive: drop-in {f.name} invalid JSON ({e}) — skipped")
                continue
            if not isinstance(t, dict) or "id" not in t:
                print(f"derive: drop-in {f.name} not a task object — skipped")
                continue
            if t["id"] in known:
                continue
            t.setdefault("repo", "server"); t.setdefault("deps", [])
            t.setdefault("priority", 5); t.setdefault("scope", []); t.setdefault("touch", [])
            t.setdefault("accept", REACT_GATE); t.setdefault("note", FACTS)
            tasks["tasks"].append(t)
            known.add(t["id"])
            print(f"derive: +{t['id']} (drop-in {f.name})")

    tmp = tasks_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(tasks, indent=2, ensure_ascii=False))
    tmp.replace(tasks_path)  # atomic — af hot-reload never sees a torn parse
    return 0


if __name__ == "__main__":
    sys.exit(main())
