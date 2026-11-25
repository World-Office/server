#!/usr/bin/env bash
# gate-hygiene.check.sh — proves the two loop gates refuse to vouch for what
# they cannot see:
#   loop-gate.sh must not judge a task worktree unless the merge target is
#   clean, the worktree differs from its base by exactly its own drop-in, and
#   that drop-in claims no token outside the task (2026-11-25: WO031-4 copied
#   editor code into main and patched main's contract-runner.cjs to get its
#   rows green — the old gate tested main's bundle and could not tell).
#   af-gate.sh must not leave timestamp-only noise in the merge target (af
#   parks every dispatch on a dirty main).
# Builds a throwaway --shared clone (plays "main") + a linked worktree (plays
# the task). Never touches the real main checkout. The refusal cases exit
# before anything boots; the honest case runs one real row (~20 s).
# Usage: bash tests/parity/gate-hygiene.check.sh     (exit 0 iff all cases hold)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${GATE_HYGIENE_REPO:-/home/weiss/git/World-Office/server}"
NODE_PATH="${NODE_PATH:-/home/weiss/node_modules}"; export NODE_PATH   # af worktrees have no node_modules
T="$(mktemp -d /tmp/gate-hygiene-XXXXXX)"
trap 'git -C "$T/main" worktree remove --force "$T/wt" 2>/dev/null || true; rm -rf "$T"' EXIT
PASS=0; FAILED=0
ok()  { echo "  ok    $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL  $1 — $2"; FAILED=$((FAILED + 1)); }

# The check must never write into the checkout it tests (2026-11-25: an early
# version ran `git commit` with the REAL main as cwd and landed a junk drop-in
# there). Every file/git operation below goes through in_wt, and the source
# checkout's HEAD+status are compared before/after as the proof.
S_HEAD="$(git -C "$SRC" rev-parse HEAD)"
S_STATUS="$(git -C "$SRC" status --porcelain | sha256sum)"

# --- fake "main": the real history (objects shared), only tests/parity out ---
git clone -q --shared --no-checkout "$SRC" "$T/main"
git -C "$T/main" sparse-checkout set tests/parity >/dev/null
git -C "$T/main" checkout -q main   # on the branch: its commits ARE the worktrees' merge base
# the gate scripts UNDER TEST are the ones next to this check (committed or not)
cp "$HERE/loop-gate.sh" "$HERE/af-gate.sh" "$T/main/tests/parity/"
git -C "$T/main" add tests/parity
# (identical to HEAD during a RED run -> nothing to commit, which is fine)
git -C "$T/main" diff --cached --quiet || git -C "$T/main" -c user.name=check -c user.email=check@localhost commit -qm "gate under test"

fresh_wt() {  # a new task worktree at HEAD, with an empty drop-in dir
  git -C "$T/main" worktree remove --force "$T/wt" 2>/dev/null || true
  rm -rf "$T/wt"
  git -C "$T/main" worktree add -q --detach "$T/wt" HEAD
  mkdir -p "$T/wt/tests/parity/overrides-dropins"
}
in_wt() { ( cd "$T/wt" && "$@" ); }
commit_dropin() {  # <slot> <token>... : a drop-in shaped like a real task's, committed as the only change
  in_wt /usr/bin/node -e '
    const fs = require("fs"), [slot, ...toks] = process.argv.slice(1);
    const rows = JSON.parse(fs.readFileSync("tests/parity/word-parity-contracts.json", "utf8")).entries;
    const by = Array.isArray(rows) ? Object.fromEntries(rows.map(r => [r.token, r])) : rows;
    const entries = {};
    for (const t of toks) { const r = by[t]; entries[t] = { effektClass: r.effektClass, woTab: r.woTab, contract: r.contract, note: "gate-hygiene check" }; }
    fs.writeFileSync(`tests/parity/overrides-dropins/loop99-${slot}.json`, JSON.stringify({ entries }, null, 1) + "\n");
  ' "$@"
  in_wt git add tests/parity/overrides-dropins
  in_wt git -c user.name=check -c user.email=check@localhost commit -qm "drop-in" -- tests/parity/overrides-dropins
}
run_gate() { (cd "$T/wt" && bash tests/parity/loop-gate.sh "$1" 2>&1); }   # as af runs it: from the worktree
refuses() {  # <case> <substring the reason must contain> <csv>
  local out rc=0
  out="$(run_gate "$3")" || rc=$?
  if [ "$rc" -eq 1 ] && grep -qF -- "$2" <<<"$out"; then ok "$1"
  else bad "$1" "rc=$rc; last lines: $(tail -n 3 <<<"$out" | tr '\n' '|')"; fi
}

echo "loop-gate.sh hygiene ($T)"
# safety rail before anything else: these must write into the fake worktree only
fresh_wt; commit_dropin 1 ctx.link
touch "$T/main/tests/parity/stray.txt"
refuses "refuses to judge while the merge target is dirty" "merge target is dirty" ctx.link
rm "$T/main/tests/parity/stray.txt"

fresh_wt; commit_dropin 1 ctx.link
echo "// patched" >> "$T/wt/tests/parity/contract-runner.cjs"
refuses "refuses a worktree that changes more than its own drop-in" "exactly its own drop-in" ctx.link

fresh_wt; OTHER="$(/usr/bin/node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).entries; console.log((Array.isArray(r)?r:Object.values(r)).map(x=>x.token).find(t=>t!=="ctx.link"&&r.find(e=>e.token===t).contract))' "$HERE/word-parity-contracts.json")"; commit_dropin 1 ctx.link "$OTHER"
refuses "refuses a drop-in that claims tokens outside the task" "claims tokens outside" ctx.link

fresh_wt; commit_dropin 1 ctx.link
out="$(run_gate ctx.link)" && grep -q 'loop-gate: claimed=1 pass=1 fail=0 rc=0' <<<"$out" \
  && ok "judges an honest drop-in (real row run on the real bundle)" \
  || bad "judges an honest drop-in" "rc=$?; last lines: $(tail -n 3 <<<"${out:-}" | tr '\n' '|')"
[ -z "$(git -C "$T/wt" status --porcelain)" ] \
  && ok "leaves the worktree clean (manifest regenerated to a temp path)" \
  || bad "leaves the worktree clean" "$(git -C "$T/wt" status --porcelain | tr '\n' ' ')"
[ -z "$(git -C "$T/main" status --porcelain)" ] \
  && ok "leaves the merge target clean" \
  || bad "leaves the merge target clean" "$(git -C "$T/main" status --porcelain | tr '\n' ' ')"

echo "af-gate.sh restore_noise"
git -C "$T/main" checkout -q -- tests/parity
sed -i 's/"generatedAt": "[^"]*"/"generatedAt": "2000-01-01T00:00:00.000Z"/' "$T/main/tests/parity/word-parity-contracts.json"
sed -i -e 's/"ranAt": "[^"]*"/"ranAt": "2000-01-01T00:00:00.000Z"/' -e 's/"pass": [0-9]*/"pass": 0/' "$T/main/tests/parity/contract-results.json"
eval "$(sed -n '/^restore_noise() {/,/^}/p' "$HERE/af-gate.sh")"
ROOT="$T/main" restore_noise 2>/dev/null || true
dirty="$(git -C "$T/main" status --porcelain -- tests/parity | sed 's/^...//' | tr '\n' ' ')"
[ "$dirty" = "tests/parity/contract-results.json " ] \
  && ok "restores timestamp-only diffs, keeps a real result change for review" \
  || bad "restore_noise" "still dirty after restore: [${dirty:-nothing}]"

# --- the proof that this check stayed inside its sandbox ---
[ "$(git -C "$SRC" rev-parse HEAD)" = "$S_HEAD" ] && [ "$(git -C "$SRC" status --porcelain | sha256sum)" = "$S_STATUS" ] \
  && ok "did not touch its source checkout ($SRC)" \
  || bad "did not touch its source checkout" "HEAD or status of $SRC changed during the check (concurrent write, or a helper escaped the sandbox)"

echo "gate-hygiene: $PASS ok, $FAILED failed"
[ "$FAILED" -eq 0 ]
