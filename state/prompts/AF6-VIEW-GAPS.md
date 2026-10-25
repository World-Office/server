# Worker Task: AF6-VIEW-GAPS — View tab: Headings, Fit page/width, Zoom 100%, Multiple pages, Interface theme, Dark document, Macros (record/pause)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF6-VIEW-GAPS`
**Title:** View tab: Headings, Fit page/width, Zoom 100%, Multiple pages, Interface theme, Dark document, Macros (record/pause)

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
3. Commit with message: `feat(AF6-VIEW-GAPS): View tab: Headings, Fit page/width, Zoom 100%, Multiple pages, Interface theme, Dark document, Macros (record/pause)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO 9.4 View tab vs WO. Gap source: census oo-deep-gap.md (view deficit 10).

VERIFIED STATE OF THE WORLD:
- View ribbon = <div class="ribbon-page" data-tab="view"> — grep index.html for it; probe what WO's view tab already has (ruler/statusbar-adjacent toggles) before adding.
- AF3-STATUSBAR just added zoom controls to the statusbar (#btn-zoom-out/#btn-zoom-in/#btn-zoom-fit + #page-indicator). The Fit page / Fit width / Zoom 100% view-tab controls must REUSE that zoom machinery (grep editor.js for zoom/applyPageView/fit) — do not build a second zoom path.
- Interface theme: a theme control may already exist at the ribbon right edge (grep for theme). If present, wire the View-tab entry to the same handler.

OO VIEW REFERENCE (deficit rows): Headings / Fit To Page / Fit To Width / Zoom to 100% / Multiple Pages / Interface Theme / Dark Document / Macros / Record macro / Pause recording.

YOUR DELIVERABLES:
1. Add View-tab controls for: Fit to page, Fit to width, Zoom to 100% (reuse statusbar zoom machinery), Headings (toggle heading outline/nav — grep editor.js for headings/toc; nav.toc exists), Multiple pages (grep applyPageView for page-view modes; a gutter/multi-page mode was added for the statusbar multiple-pages control — reuse), Interface theme (dropdown reusing existing theme handler), Dark document (toggle a document-area dark class on the canvas container — CSS only, keep style.css minimal), Macros group: Record macro / Pause recording (honest event-marker stubs: wo:macro {action:'record'|'pause'} console markers per the established marker pattern at editor.js ~line 590; NO bare console.log stubs).
2. i18n keys en+de for all new labels.
3. New test file view-gaps.test.mjs: every new control exists as a direct child of the view ribbon-page, every data-cmd dispatched in editor.js, i18n keys in both locales, zoom controls route through the SAME zoom state (assert editor.js has exactly one zoom application function they all call), no bare console.log stubs. Run ALL *.test.mjs.
4. Commit: 'feat(AF6-VIEW-GAPS): View tab OO parity — fit/zoom/multi-page, headings, theme, dark doc, macro markers' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
