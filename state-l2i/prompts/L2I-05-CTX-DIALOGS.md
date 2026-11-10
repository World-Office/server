# Worker Task: L2I-05-CTX-DIALOGS — context-menu dialog action buttons

You are an autonomous worker agent (model litellm/glm-5.3-flash via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `L2I-05-CTX-DIALOGS`
**Title:** context-menu dialog action buttons

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
tests/parity/overrides-dropins/dlg-ctx.json
```

Editing files outside this scope will FAIL the verification gate. If you
believe a file is missing from the scope, note it in your summary but
**do not edit it**.

## Acceptance gate — the orchestrator WILL run this

```sh
cd "$(git rev-parse --show-toplevel)" && bash tests/parity/af-gate.sh $((294 + $(/usr/bin/python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for v in d['entries'].values() if not v.get('xfail')) if 'entries' in d else 0)" tests/parity/overrides-dropins/dlg-ctx.json)))
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
3. Commit with message: `feat(L2I-05-CTX-DIALOGS): context-menu dialog action buttons` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
## Background
Word-parity contract layer on main at bce10603c: 294 passing / 83 known-gap / 0 FAIL. Your task: write DIALOG-DEPTH contracts into tests/parity/overrides-dropins/dlg-ctx.json - key = ledger feature id exactly; dialog action rows:
ctx.link (#btn-link-ok), ctx.content-control-settings (#btn-cc-ok), ctx.convert-to-shape (#btn-shape-ok), ctx.replace-image (#btn-image-ok), ctx.table-advanced-settings (#op-row-above - click inserts a table row; if dialog stays open use dom-mutation on row count; if unclear xfail honest), ctx.paragraph-advanced-settings (#ps-keep-next toggle), ctx.set-numbering-value (#btn-numbering-ok), ctx.adjust-list-indents (#btn-list-indents-ok), ctx.several-rows-columns (#op-insert-count is input-set which is NOT yet vocab - xfail honest or use dom-mutation if a button applies), ctx.add-comment (#btn-comment-ok). Each needs the right ctx pre (ctx-menu / ctx-menu-in-table / ctx-menu-on-image) BEFORE the opener - grep the real chain per row.

## Method (STRICT)
1. Grep BEFORE trust: ledger row -> the real dialog (index.html) + its action buttons + the OPENER button (woTab + selector that opens the dialog, e.g. #btn-find / [data-cmd="protectDialog"]).
2. Each contract uses assertion kind 'dialog-action': {kind, button:'<action #id>', dialog:'<dialog id or .dialog-overlay>'}. Set effektClass:'dialog', woTab (ribbon tab), selector=<opener> - the runner clicks opener (opens dialog) then clicks button and asserts dialog closed.
3. If the opener needs a pre (ctx-menu for ctx.*, file-menu/backstage), set pre and verify by RUNNING: node tests/parity/contract-runner.cjs --only <token> (tokens in tests/parity/word-parity-contracts.json).
4. Only assert what you SAW pass. If a button has no clean observable (dialog stays open by design, triggers download, needs input first), xfail:true + honest note.
5. Do NOT touch files outside your drop-in. No editor.js/index.html changes. Do not modify the runner.
6. Assertion kinds: dialog-action (button closes dialog), dialog-visible, dom-mutation (selector; absent:true), text-mutation, computed-style, viewport-flag, op-emitted, selection-check, unspecified. pre: none/list/table/file-menu/ctx-menu*/backstage:<pane>/menu:<selector>/chart-selection/link-at-caret.
7. ACCEPT: for CONFIRMED rows run them green; grep first even for xfails (they skip execution).
8. Minimum 6 passing rows in your drop-in (xfails do not count).

## Acceptance gate
Your work passes when: bash tests/parity/af-gate.sh <N> exits 0 (N = 294 + your non-xfail row count) - full contract run on your branch: 0 FAIL and >= that pass count (~7 min; /usr/bin/node only, NO_PROXY=127.0.0.1,localhost, WO_PORT 19700-19799 if free).
Commit only your drop-in file to branch tf/L2I-05-CTX-DIALOGS-*.
