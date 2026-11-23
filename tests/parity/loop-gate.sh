#!/usr/bin/env bash
# loop-gate.sh — fast per-task accept gate for the wo-port 1000-run loop.
# Verifies EXACTLY the tokens a task claims (its drop-in rows) via --only,
# instead of the full 688-row suite (~10 min). The full af-gate.sh still
# runs once per batch from the controller as the slow sanity check.
# Usage: tests/parity/loop-gate.sh <token-csv>
# Exit 0 iff every listed token PASSes and none FAILs.
set -euo pipefail

CSV="${1:?usage: loop-gate.sh <token-csv>}"
[ -n "$CSV" ] || { echo "loop-gate: empty token csv" >&2; exit 1; }
ROOT="$(git rev-parse --show-toplevel)"
BIN=/home/weiss/git/World-Office/server/target/debug/wo-docserver

[ -x "$BIN" ] || { echo "loop-gate: docserver binary missing: $BIN" >&2; exit 1; }

export WO_PORT=$((19000 + RANDOM % 900))
export WO_DOCSERVER_BIN="$BIN"
export WO_LEDGER=/home/weiss/git/World-Office/wo-test-harness/census/ledger/ledger.json
export NO_PROXY=127.0.0.1,localhost
# af worktrees have no built UI (dist/ gitignored). The docserver serves
# /word/ from $EDITOR_UI_DIR/word (symlink to index.html), so stage a tmp
# root with a word symlink to MAIN's prebuilt react bundle.
if [ -z "${EDITOR_UI_DIR:-}" ] || [ ! -f "$EDITOR_UI_DIR/word/index.html" ]; then
  STAGE="$(mktemp -d /tmp/wo-parity-ui-XXXXXX)"
  ln -s /home/weiss/git/World-Office/server/apps/web/apps/documenteditor-react/dist "$STAGE/word"
  export EDITOR_UI_DIR="$STAGE"
fi

cd "$ROOT/tests"
/usr/bin/node parity/generate-manifest.cjs >/dev/null 2>&1
set +e
OUT=$(/usr/bin/node parity/contract-runner.cjs --only "$CSV" --results /tmp/loop-gate.json 2>&1)
RC=$?
set -e

echo "$OUT" | tail -5
LINE=$(echo "$OUT" | grep -oE 'contract-results: [0-9]+ pass, [0-9]+ known-gap, [0-9]+ FAIL' | tail -1)
PASS=$(echo "$LINE" | grep -oE '[0-9]+ pass' | grep -oE '[0-9]+')
FAIL=$(echo "$LINE" | grep -oE '[0-9]+ FAIL' | grep -oE '[0-9]+')
N=$(echo "$CSV" | tr ',' '\n' | sed '/^$/d' | wc -l)
# no greppable line means the run threw — fail closed
[ -n "$PASS" ] || FAIL=1
echo "loop-gate: claimed=$N pass=$PASS fail=${FAIL:-1} rc=$RC"
[ "$RC" -eq 0 ] && [ "${FAIL:-1}" -eq 0 ] && [ "${PASS:-0}" -ge 1 ] && [ "$PASS" -ge "$N" ]
