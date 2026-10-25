# Worker Task: AF12-LABEL-PARITY — Label parity: rename WO labels to OO wording + promote hidden controls to top-level + placement buttons (references/collab/headerfooter/chart size)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF12-LABEL-PARITY`
**Title:** Label parity: rename WO labels to OO wording + promote hidden controls to top-level + placement buttons (references/collab/headerfooter/chart size)

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
3. Commit with message: `feat(AF12-LABEL-PARITY): Label parity: rename WO labels to OO wording + promote hidden controls to top-level + placement buttons (references/collab/headerfooter/chart size)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: the deficit report shows ~25 items that WO HAS but under different visible wording, plus controls hidden inside dropdowns that OO shows top-level, plus OO controls that belong on additional tabs. Make the labels match OO wording so parity is literal.

VERIFIED STATE OF THE WORLD (probe to confirm):
- i18n lives in i18n.js (en + de objects). Ribbon buttons carry data-i18n keys; some have aria-labels. Labels are applied at boot via apply-i18n — renaming = change the en/de STRING values (keep keys), no editor.js changes for pure renames. Any test that asserts old strings must be updated in the SAME commit (grep tests for the old wording first).
- View tab currently: Record macro / Pause recording (AF6). Insert tab has btn-smartart, btn-textfile, btn-field, btn-equation, btn-contentcontrol, btn-symbol — some are inside the btn-insert-more ('Insert tools') dropdown; the census only sees top-level controls.
- References tab (data-tab="references"): has TOC rows etc. btn-bookmark/btn-link/btn-addtext exist in OTHER tabs. Collaboration tab: Track/Review/Previous/Next change + AF10 rows. Header-footer contextual tab exists (data-tab="header-footer"). Chart-design tab: 'Apply size' single control (AF9).

YOUR DELIVERABLES:
1. RENAMES (en + de both, keep data-i18n keys): 'Increase font'→'Increment font size', 'Decrease font'→'Decrement font size', WO font-color control label → 'Font color' (probe current key first), 'Clear formatting'→'Clear style', align-center/justify labels → 'Align center'/'Justified' (probe current), 'Insert date'→'Date & Time', 'Export' (backstage)→'Download As', 'Protect with password'→'Encrypt', restrict control → 'Protect Document', 'Text art'→'TextArt', 'Insert page header'/'Insert page footer' → keep but see (4), AI tab 'Summarize'→'Summarization', 'Translate'→'Translation', 'AI assistant'→'Chatbot', view 'Record macro'→'Macros' (see (5)). German translations must stay correct German (OO-de wording: 'Schriftgröße erhöhen' etc. — translate sensibly, not literally).
2. PROMOTE to top-level insert buttons (move out of the Insert tools dropdown if hidden there — probe each): SmartArt (ensure top-level, label 'SmartArt'), Text from File ('Text from File'), Field ('Field'), Equation ('Equation'), Content Controls ('Content Controls'). Symbol stays where it is if already top-level.
3. PLACEMENT buttons (new buttons that reuse EXISTING command handlers — no new logic): References tab += 'Link' (same cmd as insert link), 'Bookmark' (same as btn-bookmark), 'Add Text' (same as btn-addtext). Collaboration tab += 'Accept' + 'Reject' (reuse the AF10 ctx accept/reject handlers — extract shared functions if inline), 'Mail Merge' (same as btn-mailmerge).
4. Header-footer contextual tab += 'Field' (insert a field into the header/footer — probe how header/footer content is targeted, reuse the btn-field handler pointed at the active header/footer container; if not targetable, fire wo:header-field marker) and 'Image' (same approach as field).
5. View tab: replace 'Record macro'/'Pause recording' pair with ONE 'Macros' dropdown menu (rows: Record macro / Pause recording / Macro manager marker wo:macro-manager) — menu markup follows the rb-menu pattern.
6. Chart-design tab: split 'Apply size' into 'Width' + 'Height' labeled inputs (same handlers, two inputs like AF4 layout size handling — probe how Apply size is wired).
7. Test file label-parity.test.mjs: (a) each renamed label present in i18n en+de (assert the new strings), (b) promoted buttons top-level in insert page (not inside the more-dropdown) + dispatched, (c) placement buttons exist + dispatched, (d) header-footer Field/Image wired, (e) Macros menu exists with 3 rows, (f) Width+Height inputs in chart-design, (g) no bare console.log. ALL *.test.mjs green (22 files after this).
8. Commit: 'feat(AF12-LABEL-PARITY): OO-identical labels, promoted insert controls, references/collab/headerfooter placement, Macros menu, chart Width/Height' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
