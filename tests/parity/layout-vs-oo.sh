#!/usr/bin/env bash
# layout-vs-oo.sh — ADVISORY ribbon-layout report: this checkout's editor dist
# (served by a throwaway docserver) against the OnlyOffice golden in the
# wo-test-harness.
#
# Why: the contract gate asks "does a control with this text exist?" and was
# 266 green on 2026-11-25 while 6 of 9 scorable ribbon tabs regressed on what
# the eye sees — rows, groups, left-to-right order. This is that missing
# signal. It stays advisory until the layout work catches up.
#
# Exits 0 whenever it produced a report (also if every tab regresses);
# exits 1 only when it could not capture (no dist, no docserver, no browser).
# Usage: tests/parity/layout-vs-oo.sh [harness-checkout] [dist-dir]
# Env:   WO_TEST_HARNESS (default ../wo-test-harness), WO_DOCSERVER_BIN,
#        LAYOUT_OUT (keep the fresh census there instead of a temp dir)
# Playwright: the harness's own census/node_modules (tracked in that repo; the
# nearest node_modules wins over NODE_PATH) — the version the goldens were
# captured with. CI only has to install its browsers.
# _boot.cjs lives in THIS repo (no node_modules on a fresh checkout), the census
# beside the harness's playwright — put both module trees on that one install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="${1:-${WO_TEST_HARNESS:-$ROOT/../wo-test-harness}}"
DIST="${2:-$ROOT/apps/web/apps/documenteditor-react/dist}"
export NODE_PATH="$HARNESS/census/node_modules${NODE_PATH:+:$NODE_PATH}"
export WO_DOCSERVER_BIN="${WO_DOCSERVER_BIN:-$ROOT/target/debug/wo-docserver}"
export WO_PORT="${WO_PORT:-$((19000 + RANDOM % 900))}"      # own port; never a dev server's
export NO_PROXY=127.0.0.1,localhost
PY="$(command -v /usr/bin/python3 || command -v python3)"

[ -f "$DIST/index.html" ] && [ -x "$WO_DOCSERVER_BIN" ] && [ -f "$HARNESS/census/layout-diff.py" ] || {
  echo "layout-vs-oo: need a built dist ($DIST/index.html), a docserver binary ($WO_DOCSERVER_BIN) and the harness ($HARNESS/census)" >&2
  exit 1
}

# The editor does not render from a plain static server (2026-11-25: 0 tabs, 0
# page errors — it waits on the docserver), so boot one on the dist under test.
# The docserver serves /word/ from $EDITOR_UI_DIR/word -> stage a tmp root.
STAGE="$(mktemp -d /tmp/wo-layout-ui-XXXXXX)"
OUT="${LAYOUT_OUT:-}"
[ -n "$OUT" ] || OUT="$(mktemp -d /tmp/wo-layout-out-XXXXXX)"
trap '[ -n "${LAYOUT_OUT:-}" ] || rm -rf "$OUT"; rm -rf "$STAGE"' EXIT
ln -s "$DIST" "$STAGE/word"
export EDITOR_UI_DIR="$STAGE"

(cd "$ROOT/tests/parity" && CENSUS_OUT="$OUT" CENSUS_SCRIPT="$HARNESS/census/census-react-deep.cjs" node -e '
  const { ensureServer } = require("./_boot.cjs");
  const { spawnSync } = require("child_process");
  ensureServer()
    .then((s) => {
      // same viewport rule as the OO golden (1600x1000) — the ribbon is responsive
      const r = spawnSync(process.execPath, [process.env.CENSUS_SCRIPT],
        { stdio: "inherit", env: { ...process.env, CENSUS_REACT_URL: s.base + "/word/" } });
      if (s.owned) s.child.kill("SIGKILL");
      process.exit(r.status === null ? 1 : r.status);
    })
    .catch((e) => { console.error("layout-vs-oo: " + e.message); process.exit(1); });
') || { echo "layout-vs-oo: capture failed" >&2; exit 1; }
[ -s "$OUT/census-react-deep.json" ] || { echo "layout-vs-oo: no census written to $OUT" >&2; exit 1; }

# One line per WO tab. A tab the tool cannot map to an OO tab comes back as
# exit 2 (input problem) — reported as "not scorable", never hidden.
"$PY" - "$HARNESS/census/layout-diff.py" "$OUT/census-react-deep.json" <<'PY' | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
import json, subprocess, sys
tool, wo = sys.argv[1], sys.argv[2]
census = json.load(open(wo))
vp = census.get("viewport", {})
print("## Ribbon layout vs OnlyOffice (advisory — never fails the run)\n")
print(f"Captured from this build at {vp.get('width')}x{vp.get('height')}; scored by `layout-diff.py` "
      f"(rows, groups, top-row placement) against the OO golden.\n")
print("| Tab | OO rows / groups | WO rows / groups | verdict |")
print("|---|---|---|---|")
ok = reg = unscorable = 0
for tab in census.get("geometry", {}):
    p = subprocess.run([sys.executable, tool, "--tab", tab, "--wo", wo, "--json"], capture_output=True, text=True)
    if p.returncode not in (0, 1):
        unscorable += 1
        why = (p.stdout.strip() or p.stderr.strip() or f"exit {p.returncode}").replace("layout-diff: ", "")
        print(f"| {tab} | — | — | not scorable yet: {why} |")
        continue
    r = json.loads(p.stdout)
    o, w = r["oo"], r["wo"]
    ok += r["ok"]; reg += not r["ok"]
    verdict = "ok" if r["ok"] else "**LAYOUT REGRESSION** — " + "; ".join(r["findings"])
    print(f"| {tab} | {o['rows']} / {o['groups']} | {w['rows']} / {w['groups']} | {verdict} |")
print(f"\n**{ok} ok, {reg} regress** of {ok + reg} scorable tabs; {unscorable} not scorable yet "
      f"(layout-diff.py has no OO-name mapping for them).")
PY
