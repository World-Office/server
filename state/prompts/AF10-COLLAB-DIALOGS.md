# Worker Task: AF10-COLLAB-DIALOGS — Collaboration tab completion (delete/resolve comments, co-edit mode) + ctx advanced-settings rows (drop cap/frame/equation/content control) + references residuals (update table, table of figures)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF10-COLLAB-DIALOGS`
**Title:** Collaboration tab completion (delete/resolve comments, co-edit mode) + ctx advanced-settings rows (drop cap/frame/equation/content control) + references residuals (update table, table of figures)

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
3. Commit with message: `feat(AF10-COLLAB-DIALOGS): Collaboration tab completion (delete/resolve comments, co-edit mode) + ctx advanced-settings rows (drop cap/frame/equation/content control) + references residuals (update table, table of figures)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity cleanup slice — three small residuals.

VERIFIED STATE OF THE WORLD (probe to confirm):
- Comments: spans carry data-author/data-text/data-replies JSON/data-resolved; toggleResolved(span) exists (~editor.js 128); comment dialog + comments panel (show/close) wired. There is NO delete-comment and NO resolve button in the collaboration ribbon today.
- Collaboration ribbon-page exists (index.html ~615): Track changes, Review changes, Add comment, Show comments, Chat, Compare, Display mode, Previous change, Next change.
- Dialogs: openDropcapDialog() exists (~6281); DIALOG_IDS registry (~1676) — add new dialogs there if you create any. Vector editor opens for equation objects (openVectorEditor('equation', spec, img), ~8092). btn-contentcontrol exists in insert tab (probe its markup/handler for the content-control model).
- References: updateToc cmd exists; a figures TOC nav (data-kind="figures") is insertable (~5287). References ribbon-page today: check index.html data-tab="references".
- Marker pattern: wo: events + console.info markers (~editor.js 590). i18n en+de mandatory. Syntax gate syntax-check.test.mjs must stay green (never regress).

YOUR DELIVERABLES:
1. Collaboration tab: add 'Resolve' button (resolves the comment at cursor / in the comments panel — reuse toggleResolved), 'Delete' button (removes the comment span — unwrap the span keeping its text; add a removeComment helper next to toggleResolved), 'Co-editing mode' dropdown (Fast/Strict — marker event wo:coedit-mode), 'Combine' button (marker wo:combine-revisions, mirrors Compare placement). Keep existing buttons untouched.
2. Context menu rows (in #ctx-menu, after the existing rows — follow AF8 row markup): 'Drop cap settings' (wires to openDropcapDialog), 'Frame advanced settings' (wo:frame-settings marker), 'Equation settings' (opens openVectorEditor('equation', ...) when selection is an equation object, else marker), 'Content control settings' (wo:content-control-settings marker), 'Remove content control' (unwraps the content-control element at cursor if the model allows — probe btn-contentcontrol handler; if it's marker-based, make remove a marker too). Each row data-i18n in BOTH locales.
3. References tab: add 'Update table' button (updateToc cmd) and 'Table of figures' button (insert the data-kind="figures" nav via the existing path ~5287) if absent — probe first, skip if a control already covers it.
4. Test file collab-dialogs.test.mjs: (a) new collaboration buttons exist + data-cmds dispatched, (b) new ctx rows exist + wired (dispatch or dialog-open path), (c) removeComment helper exists and is called by the Delete button handler, (d) references buttons wired if added, (e) i18n keys both locales, (f) no bare console.log stubs. Run ALL *.test.mjs until green (19 files after AF9).
5. Commit: 'feat(AF10-COLLAB-DIALOGS): comment resolve/delete + co-edit mode, ctx advanced-settings rows, references update-table/figures' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
