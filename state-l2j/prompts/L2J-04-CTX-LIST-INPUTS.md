# Worker Task: L2J-04-CTX-LIST-INPUTS — ctx dialogs on list state with inputs

You are an autonomous worker agent (model litellm/glm-5.3-flash via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `L2J-04-CTX-LIST-INPUTS`
**Title:** ctx dialogs on list state with inputs

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
tests/parity/overrides-dropins/di-ctx-list.json
```

Editing files outside this scope will FAIL the verification gate. If you
believe a file is missing from the scope, note it in your summary but
**do not edit it**.

## Acceptance gate — the orchestrator WILL run this

```sh
cd "$(git rev-parse --show-toplevel)" && bash tests/parity/af-gate.sh $((338 + $(/usr/bin/python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for v in d['entries'].values() if not v.get('xfail')) if 'entries' in d else 0)" tests/parity/overrides-dropins/di-ctx-list.json)))
```

You MUST run this command yourself before committing. If it fails, fix your
work and re-run. **Never commit code that fails the acceptance gate.** If
you cannot make it pass after a genuine effort, commit nothing and report
the blocker in your summary.

## Discipline

1. Read what you need, then START EDITING EARLY. Long analysis with zero
   commits counts as a failed attempt — the orchestrator checks commits.
2. If the task is large, make the minimal correct change first, run the
   gate, commit, then continue in the same pattern (progressive commits).
3. Keep diffs boring and localized. No reformatting of untouched code, no
   new dependencies unless the task asks, no speculative abstractions.
4. Do not push; the orchestrator merges.
5. Do not claim success without real file changes — this is detected and
   counted as a failure.

## When finished

1. Run the acceptance gate. It must be green.
2. `git add -A` the files in your scope (and only those).
3. Commit with message: `feat(L2J-04-CTX-LIST-INPUTS): ctx dialogs on list state with inputs` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
## Background
Contract layer on main at ad26c5404: 338 pass / 90 known-gap / 0 FAIL.
Your task: INPUT-SET depth contracts into tests/parity/overrides-dropins/di-ctx-list.json. Candidate rows:
ctx.set-numbering-value (#numbering-value input + #btn-numbering-ok, pre ctx-menu-in-list -> numbering value change), ctx.adjust-list-indents (indent inputs + #btn-list-indents-ok, pre ctx-menu-in-list -> style change - grep), ctx.several-rows-columns (count input + apply rows action, pre ctx-menu-in-table -> row count), ctx.paragraph-advanced-settings (select + #ps-keep-next, pre ctx-menu -> paragraph-settings-dialog apply -> style change), ctx.drop-cap-settings (#dropcap inputs, pre ctx-menu). Prefer override-only keys dialoginput.*.

## Method (STRICT)
1. Grep BEFORE trust: dialog markup in index.html (input/select ids) + the confirm handler in editor.js (what DOM it writes) + the opener button.
2. Contract shape: effektClass:'dialog', woTab, selector=<opener>, assertion {kind:'dialog-input', set:[{selector,value}...], click:'<apply #id>', expect:{selector:'<post-apply DOM node>'}} (or dialog:'<id>' to assert close).
3. GATE MATH IS STRICT: a dialog-input row replacing an existing GREEN row adds +0 pass but your gate threshold rises by N -> gate FAILS. Two legal plays: (a) OVERRIDE-ONLY keys prefixed 'dialoginput.*' (key matches no ledger token/feature -> emitted as extra runnable entry, +1 pass each when green), or (b) a ledger key whose current binding is xfail or absent (verify in the MERGED overrides dump first). Do NOT replace green rows.
4. Verify each row by RUNNING: /usr/bin/node tests/parity/contract-runner.cjs --only <token-or-key> (WO_PORT 19800+, NO_PROXY=127.0.0.1,localhost, WO_LEDGER=/home/weiss/git/World-Office/wo-test-harness/census/ledger/ledger.json, WO_DOCSERVER_BIN=$PWD/target/debug/wo-docserver if needed; regen manifest first).
5. Drop-in top-level key MUST be 'entries' (loader silently skips files without it).
6. xfail:true + honest note when the effect is unobservable headless (file pickers, clipboard, server round-trips). Do not touch anything outside your drop-in. No runner/editor/index.html changes.
7. Minimum 4 passing (non-xfail) rows.

## Acceptance gate
bash tests/parity/af-gate.sh <N> exits 0, N = 338 + your non-xfail row count. Full run ~7 min. Commit only your drop-in to branch tf/L2J-04-CTX-LIST-INPUTS-*.
