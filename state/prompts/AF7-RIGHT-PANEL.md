# Worker Task: AF7-RIGHT-PANEL — Right settings panel: icon rail + collapsible panel + Paragraph settings section wired to existing commands

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF7-RIGHT-PANEL`
**Title:** Right settings panel: icon rail + collapsible panel + Paragraph settings section wired to existing commands

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
3. Commit with message: `feat(AF7-RIGHT-PANEL): Right settings panel: icon rail + collapsible panel + Paragraph settings section wired to existing commands` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO has a right-edge settings panel (icon rail with 17 toggles + contextual sections: Paragraph / Table / Image / Chart / Mail Merge — census rightPanel.openedSections=84 controls). WO has NO right panel at all. This slice builds the panel skeleton + rail + the Paragraph section fully wired; other sections get honest placeholder states.

VERIFIED STATE OF THE WORLD (probe to confirm):
- Editor = vanilla JS: apps/web/apps/documenteditor-wysiwyg/{index.html, editor.js, i18n.js, style.css}. No #right-panel exists today.
- Commands ALREADY DISPATCHED in editor.js (grep 'cmd ==='): lineHeight (line ~886, wired to #line-spacing-select in More-formatting), indent, outdent, backColor, foreColor, fontSize, openPageSetup, objectOp. Spacing before/after: grep editor.js for 'spacing' — there is paragraph spacing handling; if no spacingBefore/spacingAfter command exists, ADD data-cmd handlers (set paragraph data-spacing-before/after attr consistent with how lineHeight/indent store state — grep how paragraph attrs are stored).
- Panel pattern reference: OO right panel = narrow icon rail (right screen edge, vertical) + ~280px sliding settings panel. WO statusbar/ribbon already establish the visual language (style.css, dark-mode aware vars).

YOUR DELIVERABLES:
1. index.html: add <aside id="right-panel" hidden> with a <nav id="right-rail"> icon strip (buttons: Paragraph [active], Table, Image, Chart, Mail Merge — data-panel="paragraph|table|image|chart|mailmerge", aria-pressed states) and a <div id="right-panel-body"> with sections. Paragraph section controls: line spacing select (1.0/1.15/1.5/2.0 + custom), spacing before/after number inputs, indents left/right number inputs, paragraph background color input, 'Show advanced settings' link-button (fires wo:open-paragraph-settings marker event per the established marker pattern ~editor.js line 590 — grep 'wo:' markers first and mirror them).
2. Table/Image/Chart/MailMerge sections: render a small placeholder state ('No table/image/chart selected' — i18n'd) so switching rail icons works; do NOT build their controls yet (later slice).
3. editor.js: panel open/close logic — rail button toggles the panel + switches section (aria-pressed, hidden attr); Paragraph controls dispatch EXISTING commands where present (lineHeight, indent, outdent, backColor) and NEW spacingBefore/spacingAfter commands consistent with existing paragraph attr state; panel must reflect current selection state on open (read the same state the ribbon reads — grep how #line-spacing-select gets synced).
4. A toggle to open the panel: View tab button data-cmd="toggleRightPanel" (View ribbon-page exists from AF6) + keyboard shortcut Ctrl+Shift+P (OO uses this) via the existing keybinding handler (grep editor.js keydown handling).
5. style.css: rail fixed right edge (48px wide, icon buttons), panel slides from right (~280px), works in existing dark theme (use existing CSS vars), does not overlap the statusbar, editor canvas shrinks when panel opens (mirror how existing layout shifts — check how the editor container is laid out).
6. i18n.js: every new visible label — key in BOTH en and de (RightPanel.* namespace).
7. Test file right-panel.test.mjs: assert (a) #right-panel + #right-rail + 5 rail buttons exist in index.html, (b) paragraph section has the 6 control groups, (c) every data-cmd used in the panel is dispatched in editor.js, (d) every data-i18n key exists in BOTH locales, (e) toggleRightPanel exists in View tab + keybinding, (f) no bare console.log stubs (event markers are fine). Run ALL *.test.mjs until green — do not break the existing 15.
8. Commit: 'feat(AF7-RIGHT-PANEL): right settings panel skeleton + icon rail + Paragraph section wired to existing commands' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
