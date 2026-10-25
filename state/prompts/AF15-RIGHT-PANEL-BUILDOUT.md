# Worker Task: AF15-RIGHT-PANEL-BUILDOUT — Right panel build-out: real Table, Image/Shape, Chart, Mail Merge sections replacing the AF7 placeholders

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF15-RIGHT-PANEL-BUILDOUT`
**Title:** Right panel build-out: real Table, Image/Shape, Chart, Mail Merge sections replacing the AF7 placeholders

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
3. Commit with message: `feat(AF15-RIGHT-PANEL-BUILDOUT): Right panel build-out: real Table, Image/Shape, Chart, Mail Merge sections replacing the AF7 placeholders` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Final parity slice: replace the AF7 right-panel placeholder sections with real contextual controls.

VERIFIED STATE OF THE WORLD (probe to confirm):
- Right panel from AF7: #right-panel + #right-rail (5 rail buttons: paragraph/table/image/chart/mailmerge), #right-panel-body with a real Paragraph section and placeholder sections for the rest. Section switching + toggleRightPanel + Ctrl+Shift+P exist.
- Real machinery to reuse: objectOp (AF4 — wrapping/align/bring/send/group/merge, probe its values), openBorders/borders-dialog (table borders), table resize (probe table-ops), chart machinery (AF9: chart-design tab ops, img[data-kind='chart'] with dataset.spec, chartSVG, reloadVectorTarget), image sizing (probe how images resize — handles or width/height attrs), mail merge (btn-mailmerge + its dialog — probe), image styling (probe .object CSS capabilities: opacity/rotation/flip likely via style attr or classes).
- OO reference (right panel sections): Table (borders style/color, background, rows&columns size, advanced settings); Image/Shape (size w/h, opacity 0-100, rotation + Rotate 90°, flip, wrapping style, fill/pattern/gradient, line); Chart (wrapping, size); Mail merge (recipients, merge fields, merge to).

YOUR DELIVERABLES:
1. Table section (visible when selection is in a table — mirror how AF9 chart-design gates on chart selection, probe object-selection state): border style select + color input + background color input (reuse openBorders paths where possible), rows/columns size inputs (apply to selected table via existing table resize logic — probe; if per-table only, apply to the closest table), 'Show advanced settings' → opens the existing borders/table dialog.
2. Image/Shape section (selection is an image/shape object): Width/Height inputs, Opacity range 0-100, 'Rotate 90°' button, Flip horizontal/vertical buttons, Wrapping style dropdown (same values as objectOp wrapping), Fill color input + Line (color + size) inputs applied via the object's style/classes — PROBE what the object model supports and apply honestly; where a property has no object-model support (e.g. gradient), fire wo: marker events instead of faking. 'Show advanced settings' → marker.
3. Chart section (selection is a chart object): Width/Height (reuse AF9 chart sizing), Wrapping dropdown (objectOp), 'Show advanced settings' → the same handler as chart-design's Advanced settings.
4. Mail merge section (always visible on that rail icon): rows exposing the existing mail-merge dialog actions (Recipients / Merge fields / Merge to → the btn-mailmerge dialog paths — probe the dialog's internal actions and surface them as buttons; if the dialog is monolithic, one 'Open mail merge' button + marker rows for the three actions).
5. Every section reflects selection state when the panel opens or selection changes (probe how the panel syncs today for Paragraph; reuse the mechanism).
6. i18n en+de for all new labels (RightPanel.* namespace).
7. Test file right-panel-buildout.test.mjs: (a) placeholder states GONE (no 'No table selected' style static-only sections), (b) each section's controls exist + wired (dispatch or real apply function — static assert), (c) gating logic exists (selection-awareness code present for table/image/chart), (d) i18n both locales, (e) no bare console.log. ALL *.test.mjs green (25 files).
8. Commit: 'feat(AF15-RIGHT-PANEL-BUILDOUT): real Table/Image/Chart/MailMerge right-panel sections' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
