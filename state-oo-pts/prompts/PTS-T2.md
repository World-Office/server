# Worker Task: PTS-T2 — JS: PageThumbnails rail — thumbnail strip, current-page highlight, click-to-scroll

You are an autonomous worker agent (model glm-5-turbo via zai).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `PTS-T2`
**Title:** JS: PageThumbnails rail — thumbnail strip, current-page highlight, click-to-scroll

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
apps/web/apps/documenteditor-wysiwyg/editor.js
apps/web/apps/documenteditor-wysiwyg/index.html
apps/web/apps/documenteditor-wysiwyg/i18n.js
apps/web/apps/documenteditor-wysiwyg/style.css
apps/web/apps/documenteditor-wysiwyg/page-thumbnails.test.mjs
plan/oo-port/ui-webapp.json
plan/oo-port/
```

Editing files outside this scope will FAIL the verification gate. If you
believe a file is missing from the scope, note it in your summary but
**do not edit it**.

## Acceptance gate — the orchestrator WILL run this

```sh
cd "$(git rev-parse --show-toplevel)" && grep -q 'thumbnails-rail' apps/web/apps/documenteditor-wysiwyg/index.html && grep -qE 'pages/count|pages/' apps/web/apps/documenteditor-wysiwyg/editor.js && grep -q 'btn-thumbnails-toggle' apps/web/apps/documenteditor-wysiwyg/editor.js && test -f apps/web/apps/documenteditor-wysiwyg/page-thumbnails.test.mjs && cd apps/web/apps/documenteditor-wysiwyg && /usr/bin/node page-thumbnails.test.mjs 2>&1 | grep -q 'THUMBNAILS-PASS' && cd ../../.. && /usr/bin/node -e 'const d=require("./plan/oo-port/ui-webapp.json");const rows=Array.isArray(d)?d:(d.rows||d.items||[]);const bad=rows.filter(r=>r.wo_status==="blocked"&&/PageThumbnails|^Pages$/.test(r.oo_component));console.log("still-blocked:",bad.length);process.exit(bad.length===0?0:1)' && wc -l plan/oo-port/PORT-PLAN.md
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
3. Commit with message: `feat(PTS-T2): JS: PageThumbnails rail — thumbnail strip, current-page highlight, click-to-scroll` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
(declared acceptance gate command)


## Previous attempts on this task (avoid repeating these failures)
- attempt 1: acceptance gate failed (exit 1): node:internal/modules/cjs/loader:1433
- attempt 2: acceptance gate failed (exit 1): node:internal/modules/cjs/loader:1433
