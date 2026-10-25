# Worker Task: AF14-CTX-DEPTH — Context-menu depth: spelling suggestions (edit-distance variants), Text alignment + Text direction submenus, Follow move, AI row

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF14-CTX-DEPTH`
**Title:** Context-menu depth: spelling suggestions (edit-distance variants), Text alignment + Text direction submenus, Follow move, AI row

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
apps/web/apps/documenteditor-wysiwyg
```

Editing files outside this scope will FAIL the verification gate. If you
believe a file is missing from the scope, note it in your summary but
**do not edit it**.

## Acceptance gate — the orchestrator WILL run this

```sh
cd apps/web/apps/documenteditor-wysiwyg && for t in *.test.mjs; do node "$t" > /dev/null || { echo "FAIL $t"; exit 1; }; done
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
3. Commit with message: `feat(AF14-CTX-DEPTH): Context-menu depth: spelling suggestions (edit-distance variants), Text alignment + Text direction submenus, Follow move, AI row` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO's ctx menu has dynamic spelling suggestions plus two submenus. WO's ctx menu (49 rows) lacks them.

VERIFIED STATE OF THE WORLD (probe to confirm):
- AF11 spellcheck: spellState {words:Set, ignoreSet, userDict, lang}, runSpellCheck/wrapMisspellsInTextNode, span.wo-misspelled[data-word], ctx rows gated by data-showif="misspelled" (~editor.js 6582). Dict words are lowercase in spellState.words.
- OO rows to mirror: 'Loading variants...'/'More variants...' are the OO dynamic suggestion rows (capture artifact of async suggestions) — implement as REAL suggestion rows: for the misspelled word under the caret, compute top 5 dictionary candidates by Levenshtein distance <= 2 over a SAMPLED subset of spellState.words (sample every Nth word to keep it under ~50ms — naive full scan of 300k words per keystroke is not acceptable; ponytail note the ceiling). Rows render the candidate word (no 'Loading variants' placeholder — real suggestions only), click replaces the misspelled span's word.
- Table cells: td/th support vertical alignment via CSS vertical-align — probe how table ops are applied (table-ops-dialog / objectOp). Text direction: editor has directionRtl cmd + CSS writing-mode is available.

YOUR DELIVERABLES:
1. Spelling suggestions: function spellSuggestions(word, limit=5) with sampled Levenshtein (own small implementation — no deps); in ctx menu, when a misspelled span is at selection, render suggestion rows ABOVE Ignore/Ignore all (same data-showif gating), click replaces the word text and re-runs the spell check.
2. 'Text alignment' submenu (rows Top/Middle/Bottom/Left/Center/Right): applies to the selected table cell(s) — Top/Middle/Bottom = vertical-align on td/th in selection; Left/Center/Right = text-align (existing align cmds may cover — reuse). Shown only when selection is inside a table (data-showif mechanism — extend it or hide via the same ctx build step).
3. 'Text direction' submenu (rows Horizontal/Rotate text down/Rotate text up): applies writing-mode to the selected block (probe block-format cmds like formatBlock for how block styles are set; store as data-textdir attr + CSS class so it round-trips save — CRITICAL: verify flatHtml()/save does not strip unknown attrs — grep the sanitizer allowlist and add the attr if needed).
4. 'Follow move' row (marker wo:follow-move, gated on trackChangesOn), 'AI' row (opens the AI submenu: Rewrite/Summarize/Translate rows reusing aiRewrite/aiSummarize/aiTranslate handlers — or a single row opening the AI panel if one exists).
5. i18n en+de for every new row/submenu label (Ctx.* namespace).
6. Test file ctx-depth.test.mjs: (a) spellSuggestions function exists + sampled loop present + called from ctx build, (b) suggestion rows replace + recheck wiring, (c) Text alignment/direction submenus exist with 6/3 rows + wired (dispatch or CSS-application function), (d) writing-mode attr survives the sanitizer allowlist (static assert), (e) Follow move + AI rows wired, (f) i18n both locales, (g) no bare console.log. ALL *.test.mjs green (24 files).
7. Commit: 'feat(AF14-CTX-DEPTH): ctx spelling suggestions, text alignment/direction submenus, follow move, AI rows' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
