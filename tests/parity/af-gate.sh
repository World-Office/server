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

# React editor removed (ADR-F1, 2026-11-27): documenteditor-react/dist is
# gone. The gate needs a served UI; until the Leptos port ships one, fail
# with a clear message instead of silently falling back to a stale bundle.
[ -x "$BIN" ] || { echo "gate: docserver binary missing: $BIN" >&2; exit 1; }

# A gate run must not leave the shared merge target dirty: af parks every
# dispatch on a dirty main (the loop stalled on this until someone committed
# the noise by hand), and loop-gate.sh's dirty-main refusal must mean
# pollution, not this script's timestamps. Outputs whose ONLY changes are
# timestamps are noise -> restored; any other diff is a real result change
# and stays dirty for a human to review and commit.
restore_noise() {
  local f
  for f in tests/parity/word-parity-contracts.json tests/parity/contract-results.json; do
    if [ -n "$(git -C "$ROOT" status --porcelain -- "$f")" ] && \
       [ -z "$(git -C "$ROOT" diff -U0 HEAD -- "$f" | grep -E '^[+-][^+-]' | grep -vE '"(ranAt|generatedAt)"')" ]; then
      git -C "$ROOT" checkout -- "$f" || true
    fi
  done
}
trap restore_noise EXIT

cd "$ROOT/tests"
export WO_PORT=$((19000 + RANDOM % 900))
export WO_DOCSERVER_BIN="$BIN"
export WO_LEDGER=/home/weiss/git/World-Office/wo-test-harness/census/ledger/ledger.json
export NO_PROXY=127.0.0.1,localhost
# The docserver serves /word/ from $EDITOR_UI_DIR/word/index.html. af worktrees
# have no built UI (dist/ is gitignored), so the caller must provide
# EDITOR_UI_DIR pointing at a pre-built editor. No React bundle = no gate.
if [ -z "${EDITOR_UI_DIR:-}" ] || [ ! -f "$EDITOR_UI_DIR/word/index.html" ]; then
  echo "gate: no editor UI — EDITOR_UI_DIR not set or missing word/index.html." >&2
  echo "gate: the React editor was removed (ADR-F1); the Leptos port has not shipped a full UI yet." >&2
  exit 1
fi

# The gates must be able to vouch for what they judge before their verdict
# counts (refuse on a dirty merge target / a worktree that is not exactly its
# drop-in / out-of-task claims; no timestamp noise left behind). ~25 s.
GATE_HYGIENE_REPO="$ROOT" bash parity/gate-hygiene.check.sh || { echo "gate: gate-hygiene check FAILED"; exit 1; }

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
