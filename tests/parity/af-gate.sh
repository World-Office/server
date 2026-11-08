#!/usr/bin/env bash
# af-gate.sh — shared accept gate for parity-contract tasks.
# Runs the contracts layer against the worktree checkout, reusing the MAIN
# checkout's built docserver binary (contracts tasks change test JSONs only,
# never editor code, so main's binary is the correct UI under test).
# Usage: tests/parity/af-gate.sh <min-pass-count>
# Exit 0 iff: contracts run green (0 FAIL) AND pass count >= threshold.
set -euo pipefail

MIN_PASS="${1:?usage: af-gate.sh <min-pass-count>}"
ROOT="$(git rev-parse --show-toplevel)"
BIN=/home/weiss/git/World-Office/server/target/debug/wo-docserver

[ -x "$BIN" ] || { echo "gate: docserver binary missing: $BIN" >&2; exit 1; }

cd "$ROOT/tests"
export WO_PORT=$((19000 + RANDOM % 900))
export WO_DOCSERVER_BIN="$BIN"
export WO_LEDGER=/home/weiss/git/World-Office/wo-test-harness/census/ledger/ledger.json
export NO_PROXY=127.0.0.1,localhost

/usr/bin/node parity/generate-manifest.cjs >/dev/null
set +e
OUT=$(/usr/bin/node parity/run-parity.cjs --layer=contracts 2>&1)
RC=$?
set -e

echo "$OUT" | tail -20
LINE=$(echo "$OUT" | grep -oE 'contract-results: [0-9]+ pass, [0-9]+ known-gap, [0-9]+ FAIL' | tail -1)
PASS=$(echo "$LINE" | grep -oE '[0-9]+ pass' | grep -oE '[0-9]+')
FAIL=$(echo "$LINE" | grep -oE '[0-9]+ FAIL' | grep -oE '[0-9]+')

# Per-tab completeness: every non-contextual ribbon page must show its floor
# of visible interactive controls (catches empty/leaked tab panels the
# contract layer cannot see).
CEN=$(/usr/bin/node parity/surfaces/tab-census.cjs 2>&1) || {
  echo "$CEN" | tail -15
  echo "gate: tab-census FAILED"
  exit 1
}
echo "$CEN" | tail -2

# Command liveness: every data-cmd control must be wired (runCommand branch,
# dedicated handler) or a supported native execCommand — no silent no-ops.
LIV=$(/usr/bin/node parity/surfaces/command-liveness.cjs 2>&1) || {
  echo "$LIV" | tail -12
  echo "gate: command-liveness FAILED"
  exit 1
}
echo "$LIV" | tail -1

# Right-panel parity: WO settings panel sections at floor + OO anchor coverage.
RP=$(/usr/bin/node parity/surfaces/right-panel.cjs 2>&1) || {
  echo "$RP" | tail -11
  echo "gate: right-panel surface FAILED"
  exit 1
}
echo "$RP" | tail -1

echo "gate: pass=$PASS fail=$FAIL min=$MIN_PASS rc=$RC"
[ "$RC" -eq 0 ] && [ "${FAIL:-1}" -eq 0 ] && [ "${PASS:-0}" -ge "$MIN_PASS" ]
