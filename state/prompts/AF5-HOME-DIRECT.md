# Worker Task: AF5-HOME-DIRECT — Home tab: promote OO direct controls WO hides in menus or lacks (font size +/-, subscript, font color, clear style, bullets/numbering toggles, borders, shading, nonprinting, replace, select all)

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF5-HOME-DIRECT`
**Title:** Home tab: promote OO direct controls WO hides in menus or lacks (font size +/-, subscript, font color, clear style, bullets/numbering toggles, borders, shading, nonprinting, replace, select all)

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
3. Commit with message: `feat(AF5-HOME-DIRECT): Home tab: promote OO direct controls WO hides in menus or lacks (font size +/-, subscript, font color, clear style, bullets/numbering toggles, borders, shading, nonprinting, replace, select all)` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO 9.4 Home tab vs WO. Gap source: census oo-deep-gap.md (home deficit 17). IMPORTANT: many of these features ALREADY EXIST in WO but only inside the 'More formatting' (22-row) menu or the Bullet/Numbering 'style options' caret menus — census label-matching missed them. VERIFY EACH ITEM FIRST (grep index.html home section + the More formatting menu-list); only ADD a direct control where a DIRECT ribbon button/select is genuinely absent. Where the feature exists only in a menu, promote it to a direct control (keep the menu row too).

VERIFIED STATE OF THE WORLD:
- Home ribbon = <div class="ribbon-page" data-tab="home"> (index.html ~line 208), WO-RIBBON-FLEX layout: .rb-group clusters, .rb-sep hairlines, 24px elset rows, right-edge tools pinned margin-left:auto.
- Existing menus: 'More font families', 'More font sizes', 'Change case', 'Script options', 'Bullet style options', 'Numbering style options', 'Paragraph direction options', 'More formatting' (22 rows). Grep their menu-list rows before adding anything.
- data-cmd pattern is the established wiring; editor.js dispatches data-cmd centrally (grep 'data-cmd' handling / closest('[data-cmd]')).

OO HOME REFERENCE (direct controls OO has):
Increment font size (Ctrl+]) / Decrement font size (Ctrl+[) / Subscript (Ctrl+.) / Font color / Clear style / Bullets / Numbering / Paragraph line spacing / Text direction / Align center (Ctrl+E) / Justified (Ctrl+J) / Nonprinting characters (Ctrl+Shift+8) / Shading / Borders / Replace (Ctrl+H) / Select all (Ctrl+A)

YOUR DELIVERABLES:
1. For EACH item above: grep index.html; if a direct control exists, note it in the commit body and skip. Otherwise add a direct button/select into the appropriate .rb-group (Font cluster: size +/-, subscript, font color, clear style; Paragraph cluster: bullets toggle, numbering toggle, line spacing select or menu, text direction, align center/justified if absent as direct buttons, shading, borders; editing: replace, select all).
2. Wiring: prefer existing data-cmd commands (grep editor.js for e.g. setFontSize, toggleScript, applyAlignment, moreFormat handlers — the More formatting menu rows already map features to commands; REUSE those command names for the promoted buttons). Font size +/-: step the #font-size select value and fire its change path. Replace/Select all: reuse existing handlers (grep btn-replace / selectAll / 'Select all' in More formatting rows).
3. aria-keyshortcuts where OO shows them (Ctrl+], Ctrl+[, Ctrl+., Ctrl+E, Ctrl+J, Ctrl+Shift+8, Ctrl+H, Ctrl+A).
4. i18n keys en+de for every new visible label.
5. New test file home-direct.test.mjs: for each promoted control assert (a) it is a DIRECT child of the home ribbon-page (not only inside a menu-list), (b) its data-cmd/id is dispatched in editor.js, (c) i18n key in both locales, (d) existing tests still pass — run ALL *.test.mjs.
6. Commit: 'feat(AF5-HOME-DIRECT): Home tab — promote OO direct controls (font size +/-, subscript, colors, borders/shading, bullets/numbering toggles, replace/select-all)' + body listing what was already present vs added.

Worktree layout: you are at the monorepo root; paths above are relative to it.
