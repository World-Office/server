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
STAGE=""; MF=""
cleanup() { [ -z "$STAGE" ] || rm -rf "$STAGE"; [ -z "$MF" ] || rm -f "$MF"; true; }
trap cleanup EXIT
fail() { echo "loop-gate: $*" >&2; exit 1; }

# A loop task promises exactly one thing: its own drop-in file. Until that is
# true, main's prebuilt bundle proves nothing about the worktree — so check it
# before anything is booted, and refuse to judge when it fails (2026-11-25:
# WO031-4 copied editor code into main and patched main's contract-runner.cjs
# to get its rows green; the gate then tested main and could not tell).
# Only meaningful in a linked (task) worktree: run in main itself there is no
# merge target to protect and nothing to compare a base against.
linked() { [ "$(cd "$(git rev-parse --git-dir)" && pwd -P)" != "$(cd "$(git rev-parse --git-common-dir)" && pwd -P)" ]; }
hygiene() {
  local main dirty base own extra
  linked || return 0
  main="$(git worktree list --porcelain | head -n1 | sed 's/^worktree //')"
  dirty="$(git -C "$main" status --porcelain)"
  [ -z "$dirty" ] || fail "merge target is dirty — refusing to judge ($main); a gate must never pass because of what someone left in the checkout it trusts:
$dirty"
  base="$(git merge-base HEAD main)"
  own="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sed '/^$/d')"
  [ -n "$own" ] || fail "no drop-in committed: this worktree does not differ from its base ($base)"
  { [ "$(printf '%s\n' "$own" | wc -l)" -eq 1 ] && case "$own" in tests/parity/overrides-dropins/*.json) true ;; *) false ;; esac; } \
    || fail "a loop task changes exactly its own drop-in file; this worktree differs from its base ($base) by:
$own"
  extra="$(/usr/bin/node -e '
    const [f, csv] = process.argv.slice(1);
    const d = JSON.parse(require("fs").readFileSync(f, "utf8"));
    const mine = new Set(csv.split(",").map(s => s.trim()).filter(Boolean));
    console.log(Object.keys(d.entries || {}).filter(k => !mine.has(k)).join(" "));
  ' "$ROOT/$own" "$CSV" 2>&1)" || fail "drop-in unreadable: $extra"
  [ -z "$extra" ] || fail "drop-in claims tokens outside this task ($CSV): $extra"
}
hygiene

[ -x "$BIN" ] || { echo "loop-gate: docserver binary missing: $BIN" >&2; exit 1; }

export WO_PORT=$((19000 + RANDOM % 900))
export WO_DOCSERVER_BIN="$BIN"
export WO_LEDGER=/home/weiss/git/World-Office/wo-test-harness/census/ledger/ledger.json
export NO_PROXY=127.0.0.1,localhost
# af worktrees cannot build the UI (no node_modules, dist/ gitignored), so the
# docserver serves MAIN's prebuilt bundle. That is the worktree's build by
# construction once `hygiene` has shown the worktree is main + one drop-in.
if [ -z "${EDITOR_UI_DIR:-}" ] || [ ! -f "$EDITOR_UI_DIR/word/index.html" ]; then
  STAGE="$(mktemp -d /tmp/wo-parity-ui-XXXXXX)"
  ln -s /home/weiss/git/World-Office/server/apps/web/apps/documenteditor-react/dist "$STAGE/word"
  export EDITOR_UI_DIR="$STAGE"
fi

# The manifest is regenerated for every run (pure function of the ledger), but
# to a temp path: the tracked copy is a committed artifact, and a gate run
# must not leave the worktree dirty — af commits whatever it finds there
# before judging the task's scope.
cd "$ROOT/tests"
MF="$(mktemp /tmp/wo-loop-manifest-XXXXXX.json)"
/usr/bin/node parity/generate-manifest.cjs --out "$MF" >/dev/null 2>&1 \
  || fail "manifest generation failed (ledger missing at WO_LEDGER=$WO_LEDGER?)"
set +e
OUT=$(/usr/bin/node parity/contract-runner.cjs --manifest "$MF" --only "$CSV" --results /tmp/loop-gate.json 2>&1)
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
