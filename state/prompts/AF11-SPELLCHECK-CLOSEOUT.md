# Worker Task: AF11-SPELLCHECK-CLOSEOUT — Spellcheck engine (dic wordlists, misspell marking, ctx Ignore/Ignore-all/Add-to-dictionary/Select-language) + statusbar word count + AI Settings + backstage Save

You are an autonomous worker agent (model litellm/glm-4.7 via litellm).
You have been assigned **exactly one task**. Do it well, verify it, commit it.
You are in an isolated git worktree at the repo root — all paths below are
relative to it.

## Your task

**ID:** `AF11-SPELLCHECK-CLOSEOUT`
**Title:** Spellcheck engine (dic wordlists, misspell marking, ctx Ignore/Ignore-all/Add-to-dictionary/Select-language) + statusbar word count + AI Settings + backstage Save

The full acceptance criteria (verified state of the world, reference data,
and deliverables) are in the **Acceptance criteria** section below — read
them fully before touching anything, then follow them literally. If the
criteria reference a file or command, probe it first to confirm reality.

## File scope — edit ONLY these paths

```
apps/web/apps/documenteditor-wysiwyg
core/crates/wo-docserver/frontend-dist
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
3. Commit with message: `feat(AF11-SPELLCHECK-CLOSEOUT): Spellcheck engine (dic wordlists, misspell marking, ctx Ignore/Ignore-all/Add-to-dictionary/Select-language) + statusbar word count + AI Settings + backstage Save` (+ a short body
   describing what you implemented and any deviations).
4. Reply with a concise summary: what you implemented, tests added/passed,
   deviations and follow-ups.


## Acceptance criteria (auto-appended)
Final parity slice: the only structurally-new surface left is spellcheck; three tiny residuals ride along.

VERIFIED STATE OF THE WORLD (probe to confirm):
- Editor: #editor is contenteditable spellcheck=true (index.html ~872). #document-language select exists (~970, 'drives spellcheck + the editor lang attr'). A #settings-dialog exists (~1860) with a #settings-spellcheck checkbox — probe what it toggles today.
- Hunspell dictionaries ALREADY IN THE MONOREPO (copy, do not regenerate): core/crates/wo-docserver/frontend-dist/word-react-backup-20260924/dictionaries/{en-US.dic 538K, en-US.aff, de-DE.dic 1.1M, de-DE.aff}. NOTE the served editor bundle is a plain static dir — copy the 2 .dic files into apps/web/apps/documenteditor-wysiwyg/dictionaries/ and fetch() them lazily (only when spellcheck is first enabled or on first misspell pass), NOT at page load. Do NOT parse .aff rules — use the .dic word set + a simple English/german suffix fallback (word, word+s, word+es, word+ed, word+ing, word+er, word+ers; de: word+n, word+s, word+e, word+en, word+ern, word+es). German compounds: also accept if a word splits cleanly into two dictionary words (first >= 3 chars, second >= 3 chars) — one pass is enough.
- Ctx menu: #ctx-menu rows follow the AF8/AF10 markup (data-cmd rows dispatched via runCommand pipeline, or wo: marker events). Marker pattern grep 'wo:' in editor.js.
- Save path: wo-bridge.js POSTs /api/documents/{id}/save with {html} (~line 125); editor.js already saves HTML back (grep its save/flush function and reuse it — do NOT write a new save path).
- Statusbar: 7 buttons today (zoom/fit/multi-page/track-changes/language) — no word count.
- AI tab: has Summarize/Translate/Rewrite/Grammar/AI assistant/AI changes — no Settings.
- Backstage (#file-menu): New/Open/Export/Print/History/AI changes/Info/Protect/Settings/Help/Suggest — no Save.
- i18n en+de mandatory for every visible label. syntax-check.test.mjs gate must stay green. 20 test files today.

YOUR DELIVERABLES:
1. Spellcheck engine in editor.js (lazy module): SpellCheck = {enabled, lang, ignoreSet (session), userDict (localStorage 'wo-user-dict'), words:Set|null}. toggleSpellcheck(enabled) / setSpellcheckLang(lang) wire the EXISTING #settings-spellcheck checkbox and #document-language select to it. check() walks #editor text nodes (skip code/links/etc — mirror what the readability/tokenizer code already skips, grep how lists/formatting walk text), wraps misspellings in <span class="wo-misspelled" data-word="..."> with underline styling in style.css, debounced (~800ms) on input + on toggle. Marking must round-trip safely: unwrap before save/export (grep the save serialization point and strip .wo-misspelled wrappers there — CRITICAL: saved HTML must NOT contain misspell spans).
2. Ctx rows (only shown when a .wo-misspelled span is in/next to selection — otherwise hide, mirroring how ctx-menu already adapts rows if it does; if it has no conditional mechanism, add data-showif="misspelled" handling): 'Ignore' (add word to session ignoreSet, re-check), 'Ignore all' (same + persist to localStorage), 'Add to dictionary' (userDict, re-check), 'Select language' (small submenu or opens the existing language select behavior). i18n en+de (Ctx.* namespace).
3. Statusbar word count: static <span> (not button) 'Words: N' updating on input (debounce shared with spellcheck), i18n en+de (Status.Words).
4. AI tab: 'Settings' button opening the existing #settings-dialog (data-cmd="aiSettings" → openOverlayDialog('settings-dialog')).
5. Backstage: 'Save' row (before Export) calling the EXISTING save/flush path (probe editor.js save function; if only an autosave timer exists, extract the flush call). data-cmd="saveDocument".
6. Test file spellcheck.test.mjs: (a) dictionaries/en-US.dic + de-DE.dic copied and non-empty (>10k lines), (b) wo-misspelled class styled in style.css, (c) ctx rows exist + dispatched/marker-wired + i18n both locales, (d) save path strips .wo-misspelled wrappers (static assert: the save serialization contains the unwrap call — grep-level), (e) word count span + i18n, (f) aiSettings + saveDocument cmds dispatched, (g) no bare console.log. Run ALL *.test.mjs until green (21 files).
7. Commit: 'feat(AF11-SPELLCHECK-CLOSEOUT): spellcheck engine + ctx spell rows, statusbar word count, AI settings, backstage save' + body.

Worktree layout: you are at the monorepo root; paths above are relative to it.
