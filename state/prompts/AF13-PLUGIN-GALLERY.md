# Worker Task: AF13-PLUGIN-GALLERY — Plugins tab parity: Plugin Manager button + gallery cards wired to real commands where they exist (Translator/Speech/Highlight code/Thesaurus) and honest cards for the rest

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF13-PLUGIN-GALLERY`
**Title:** Plugins tab parity: Plugin Manager button + gallery cards wired to real commands where they exist (Translator/Speech/Highlight code/Thesaurus) and honest cards for the rest

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
3. Commit with message: `feat(AF13-PLUGIN-GALLERY): Plugins tab parity: Plugin Manager button + gallery cards wired to real commands where they exist (Translator/Speech/Highlight code/Thesaurus) and honest cards for the rest` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Parity slice: OO plugins tab shows Plugin Manager + third-party cards (YouTube, Translator, Mendeley, Thesaurus, Highlight code, Zotero, Speech, Speech input). WO plugins tab has 5 controls (probe current: likely manage/browsePlugins + OCR etc).

VERIFIED STATE OF THE WORLD (probe to confirm):
- editor.js ALREADY dispatches: managePlugins, browsePlugins, readAloud, dictate, aiTranslate, aiRewrite, aiSummarize, code (inline code format). Probe each handler for reuse.
- Plugins tab = index.html data-tab="plugins". Card pattern: OO uses icon+label cards; WO style.css has button idioms — small .plugin-card buttons in a flex row are fine (follow existing style, add CSS).

YOUR DELIVERABLES:
1. 'Plugin Manager' button → managePlugins handler (reuse; if only browsePlugins exists, add a managePlugins cmd that opens the same plugin surface).
2. Gallery cards, each wired to the REAL command where one exists: Translator → aiTranslate flow, Speech → readAloud, Speech input → dictate, Thesaurus → aiRewrite (prompt 'Find synonyms for the selection'), Highlight code → code cmd. Cards with NO real backend (YouTube, Mendeley, Zotero) open a small info dialog ('Third-party plugin — not available in this build', i18n'd, wo:plugin-unavailable marker) — honest, no fake.
3. i18n en+de for every card label + dialog text (Plugins.* namespace).
4. Test file plugin-gallery.test.mjs: (a) Plugin Manager + 8 cards exist, (b) real-wired cards dispatch existing cmds (static assert), (c) info-dialog cards share the marker, (d) i18n both locales, (e) no bare console.log. ALL *.test.mjs green (23 files).
5. Commit: 'feat(AF13-PLUGIN-GALLERY): plugin manager + gallery cards wired to real commands' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
