# Worker Task: L2H-05-LAYOUT-PROTECT — layout-protect

You are an autonomous worker agent (model litellm/glm-5.3-flash via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `L2H-05-LAYOUT-PROTECT`
**Title:** layout-protect

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
tests/parity/overrides-dropins/layout-protect.json
```

Editing files outside this scope will FAIL the verification gate. If you
believe a file is missing from the scope, note it in your summary but
**do not edit it**.

## Acceptance gate — the orchestrator WILL run this

```sh
cd "$(git rev-parse --show-toplevel)" && bash tests/parity/af-gate.sh $((241 + $(/usr/bin/python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for v in d['entries'].values() if not v.get('xfail')) if 'entries' in d else 0)" tests/parity/overrides-dropins/layout-protect.json)))
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
3. Commit with message: `feat(L2H-05-LAYOUT-PROTECT): layout-protect` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
## Background
Word-parity contract layer on main at 75df6427c: 241 passing / 58 known-gap / 0 FAIL. Your task: write contracts into tests/parity/overrides-dropins/layout-protect.json — key = ledger feature id exactly; candidates:
layout/protect/view/statusbar/chart-panel rows: page.orientation (Orientation dialog), page.breaks (Breaks), page.wrapping (Wrapping — needs object selected: pre ctx-menu-on-image), page.align + page.group + page.merge-shapes (objectOp — need object/multi-object pres; if handlers need positioned objects, xfail honest with that note), table.table-of-contents (updatetoc-dialog), table.table-of-figures, protect.protect-document (restrictEditing dialog), view.zoom-to-100 (btn-zoom-reset — applyZoom effect: statusbar text or body attr), statusbar.btn-zoom-topage/towidth (btn-zoom-fit — same family), plugins.highlight-code (code), headerfooter.field (btn-field) + headerfooter.close (btn-hf-close — needs hf state: pre may need a header insert first), chart.wrapping/width/height (chart-selection pre; width/height are inputs -> xfail 'input-set vocabulary' unless a stepper button exists), page.custom-columns (menu:columns Custom columns dialog).

## Method (STRICT)
1. Grep BEFORE trust: find the ledger row, then the real WO control (apps/web/apps/documenteditor-wysiwyg/index.html data-cmd / [data-ctx], editor.js handler) and its actual DOM effect.
2. Verify by RUNNING: node tests/parity/contract-runner.cjs --only <token> (tokens are label-derived; check tests/parity/word-parity-contracts.json).
3. Only assert what the code actually does; xfail:true + honest note for real gaps. NOTE: xfails are NOT executed at full-run scale (fast-path) — so verify the premise by grepping the handler, not by running.
4. Do NOT touch files outside your drop-in. No editor.js / index.html changes.
5. Runner vocabulary: effektClass {format,structure,dialog,op,view}; assertion kinds: dom-mutation (selector; optional absent:true), dialog-visible, text-mutation (contains/containsDate), format-mark, viewport-flag (selector/prop/equals), selection-check, op-emitted (event wo:*; armed names: follow-move chart-3d chart-settings field-op chart-elements). pre: none, list, table, file-menu, backstage:<pane>, menu:<trigger-selector>, ctx-menu*, chart-selection, link-at-caret. pre runs BEFORE the woTab click; ctx rows need [data-ctx=X] selectors; shortcuts use key:'Ctrl+B'.
6. Minimum 8 passing rows in your drop-in (xfails do not count toward the gate).

## Acceptance gate
Your work passes when: bash tests/parity/af-gate.sh <N> exits 0 (N = 241 + your non-xfail row count) — full contract run on your branch: 0 FAIL and >= that pass count (~7 min; /usr/bin/node only, NO_PROXY=127.0.0.1,localhost, WO_PORT 19600-19699 if free).
Commit only your drop-in file to branch tf/L2H-05-LAYOUT-PROTECT-*.
