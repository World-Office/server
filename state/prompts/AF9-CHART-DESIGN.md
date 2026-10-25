# Worker Task: AF9-CHART-DESIGN — Chart design tab: contextual controls operating on chart SVG objects (type, edit/update data, elements toggles, wrapping, size)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF9-CHART-DESIGN`
**Title:** Chart design tab: contextual controls operating on chart SVG objects (type, edit/update data, elements toggles, wrapping, size)

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
3. Commit with message: `feat(AF9-CHART-DESIGN): Chart design tab: contextual controls operating on chart SVG objects (type, edit/update data, elements toggles, wrapping, size)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO has a contextual 'Chart design' tab (15 controls: Chart Elements menu, Edit Data, Update Data, Chart type, Advanced settings, Wrapping, Width, Height, 3D rotation) shown when a chart is selected. WO has NO chart-design tab, but HAS real chart machinery.

VERIFIED STATE OF THE WORLD (probe to confirm):
- Charts: btn-chart opens #chart-dialog (type select, title, data rows). editor.js has chartSVG(type, title, rows) (~line 8191), insertVectorObject(svg, 'chart', spec) / reloadVectorTarget(...) (~line 8263), and a vector click handler (~line 8085) that opens openVectorEditor(kind, spec, img) for img[data-kind='chart'|'equation'|'smartart'] — spec JSON lives in img.dataset.spec. PROBE how the chart dialog save path works (chartOk handler) and how the click handler distinguishes single vs double click before wiring the tab.
- Object ops: objectOp command exists (AF4) — wrapping/align/bring/send/group/merge on .object selections. Object resize: grep editor.js for object resize handles.
- Ribbon: tabs are <button class="ribbon-tab" data-tab=...> + <div class="ribbon-page" data-tab=...> (index.html ~198). i18n keys required in BOTH en and de. Tests: zero-dep node *.test.mjs static analysis + node --check syntax gate (syntax-check.test.mjs — NEVER regress it).

YOUR DELIVERABLES:
1. New ribbon tab data-tab="chart-design" (label 'Chart design', i18n en+de) + its ribbon-page with: (a) 'Chart type' dropdown menu (bar/line/pie + any types chartSVG supports — probe chartSVG for the type set), (b) 'Edit data' button (opens the chart editor for the currently selected chart — reuse openVectorEditor path), (c) 'Update data' button (re-renders the selected chart from its dataset.spec via reloadVectorTarget), (d) 'Chart elements' dropdown (toggles: chart title, legend, gridlines, data labels — store flags in spec.elements and re-render; if chartSVG does not support a flag, extend chartSVG minimally to honor it — legend/title/gridlines at minimum), (e) 'Advanced settings' button (wo:chart-settings marker event — established marker pattern, grep 'wo:' in editor.js), (f) 'Wrapping' dropdown (reuse the AF4 objectOp wrapping values), (g) Width/Height number inputs applying to the selected chart object (mirror existing object resize), (h) '3D rotation' button (wo:chart-3d marker stub — honest event, not bare console.log).
2. Selection wiring: selecting a chart object (img[data-kind='chart'] inside .object) makes the chart-design tab operable; with no chart selected, controls fire marker events / no-op visibly disabled (aria-disabled) — probe how object selection state is tracked (grep selection / active-object in editor.js).
3. i18n: every new label key in BOTH en and de (Chart.* namespace).
4. Test file chart-design.test.mjs: (a) chart-design tab + page exist with the 8 control groups, (b) every data-cmd in the tab is dispatched in editor.js, (c) chartSVG honors spec.elements flags at least for legend+title+gridlines (static assert: chartSVG source reads the flags — grep-level check), (d) i18n keys both locales, (e) no bare console.log stubs. Run ALL *.test.mjs until green — 18 files today, do not break any.
5. Commit: 'feat(AF9-CHART-DESIGN): chart design tab — type/edit/update data, elements toggles, wrapping, size, 3D marker' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
