# Worker Task: AF8-INSERT-CTX-CLEANUP — Insert tab residual (Blank Page, Text Box, TextArt, Comment, Breaks) + context-menu completion (Edit/Remove link, keep lines, list controls, track-change actions, Formatting as Style)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF8-INSERT-CTX-CLEANUP`
**Title:** Insert tab residual (Blank Page, Text Box, TextArt, Comment, Breaks) + context-menu completion (Edit/Remove link, keep lines, list controls, track-change actions, Formatting as Style)

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
3. Commit with message: `feat(AF8-INSERT-CTX-CLEANUP): Insert tab residual (Blank Page, Text Box, TextArt, Comment, Breaks) + context-menu completion (Edit/Remove link, keep lines, list controls, track-change actions, Formatting as Style)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity cleanup slice — two small residuals in one task.

VERIFIED STATE OF THE WORLD:
- Insert ribbon-page (index.html data-tab="insert") already has 25 controls incl. table/image/shape(smartart)/chart/equation/symbol/field/contentcontrol/mailmerge/textfile/dropcap/pagenumber/header/footer/datetime/bookmark/crossref. MISSING vs OO insert (23 buttons): Blank Page, Text Box, TextArt, Comment (exists only in ctx menu today), Breaks (exists only in Layout tab from AF4).
- #ctx-menu currently ~48 rows (data-i18n Ctx.*). OO ctx rows WO still lacks: Edit link, Remove link, Keep lines together, Start new list, Set numbering value, Continue numbering, Adjust list indents, Formatting as Style, Print selection, Accept change, Reject change, Paragraph advanced settings, Table of contents settings, Update field, Edit field, Toggle field codes.
- Commands ALREADY DISPATCHED in editor.js: link, insertPageBreak, insertColumnBreak, insertSectionBreak, lineHeight, insertUnorderedList/insertOrderedList, listStyle, acceptChange, trackChangesOn, nextTrackedChange, prevTrackedChange, updateToc, objectOp (AF4), openPageSetup, openCrossref. btn-link exists (grep its handler for how links are inserted/edited).
- Marker pattern: wo: events + console markers (editor.js ~line 590) — honest stubs fire observable events; bare console.log is NOT acceptable.

YOUR DELIVERABLES:
1. Insert tab: Blank Page button (data-cmd="insertBlankPage" — implement: page break + empty paragraph, reuse insertPageBreak path); Text Box button (data-cmd="insertTextbox" — insert div.object.textbox marker element via the existing object-insert machinery, grep objectOp / btn-object); TextArt button (data-cmd="insertTextart" — same path + textart styling class); Comment button (reuse the ctx-menu AddComment handler — extract to a shared command if it's inline); Breaks dropdown (copy the AF4 Layout Breaks menu markup — data-cmd rows insertPageBreak/insertColumnBreak/insertSectionBreak).
2. Context menu — add rows for the feasible subset, each wired: Edit link / Remove link (operate on the selection's <a> — grep link handler), Keep lines together (data-cmd="toggleKeepLines" — paragraph attr, mirror keepNext/keepLines state if present, else new attr + CSS class), Start new list + Continue numbering + Set numbering value + Adjust list indents (list cmd variants — reuse insertUnorderedList/insertOrderedList/listStyle paths; Set numbering value / Adjust list indents may be wo:list-settings marker events opening a small dialog later), Formatting as Style (wo:style-from-format marker), Print selection (data-cmd="printSelection" — window.print() with selection if trivial, else marker), Accept change / Reject change (acceptChange exists; add rejectChange sibling), Paragraph advanced settings + Table of contents settings + Update/Edit/Toggle field codes (wo: marker events per established pattern).
3. Every new row: data-i18n key in BOTH en and de (Ctx.* namespace).
4. Test file insert-ctx-cleanup.test.mjs: assert (a) the 5 new insert controls exist in the insert ribbon-page AND every data-cmd is dispatched in editor.js, (b) the new ctx rows exist in #ctx-menu and are dispatched, (c) i18n keys both locales, (d) no bare console.log stubs, (e) #ctx-menu row count grows by >= 10. Run ALL *.test.mjs until green.
5. Commit: 'feat(AF8-INSERT-CTX-CLEANUP): insert residuals (blank page, textbox, textart, comment, breaks) + ctx-menu completion rows' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
