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

echo "gate: pass=$PASS fail=$FAIL min=$MIN_PASS rc=$RC"
[ "$RC" -eq 0 ] && [ "${FAIL:-1}" -eq 0 ] && [ "${PASS:-0}" -ge "$MIN_PASS" ]
