# Worker Task: AF4-LAYOUT-COMPLETE — Layout tab to OO parity: Columns/Breaks dropdowns, object ops (Wrapping/Align/Bring/Send/Group/Merge Shapes), Size presets to OO set

You are an autonomous worker agent in the World-Office Engine Rebuild pipeline.
You have been assigned **exactly one task**. Do it well, verify it, commit it.

## Context documents (READ FIRST)

1. **Contract:** `{{PLAN_SECTION}}` of `plan/2026-07-25-engine-rebuild-execution-plan.md`
   — read this section fully; it defines the exact types, signatures, and invariants.
2. **OpenSpec change:** `openspec/changes/rebuild-doc-mutation-engine/` (if your task is
   engine `DM` or `foundation`) — read `design.md` and the relevant `specs/*/spec.md`.
3. **Project conventions:** `server/AGENTS.md` (build/test/lint commands, mutation idioms).

## Your task

**ID:** `AF4-LAYOUT-COMPLETE` (engine: `{{ENGINE}}`)
**Title:** Layout tab to OO parity: Columns/Breaks dropdowns, object ops (Wrapping/Align/Bring/Send/Group/Merge Shapes), Size presets to OO set

Implement the contract defined in `{{PLAN_SECTION}}`.

## File scope — edit ONLY these paths

```
{{SCOPE_BLOCK}}
```

Editing files outside this scope will FAIL the verification gate. If you believe a file
is missing from the scope, note it in your summary but **do not edit it** — the
orchestrator will re-scope and re-dispatch.

## Acceptance gate — the orchestrator WILL run this

```sh
{{ACCEPT_COMMAND}}
```

You MUST run this command yourself before committing. If it fails, fix your work and
re-run. **Never commit code that fails the acceptance gate.** If you cannot make it
pass after a genuine effort, commit nothing and report the blocker in your summary.

## Hard rules (project-wide invariants)

1. **Mutation idiom (Rust):** use the `extract_body`/`store_body` clone-mutate-store
   pattern — clone `DocxBody` out of `DOC_MODEL_STORE`, mutate, store back. NEVER hold
   a borrow across a mutation.
2. **Unicode safety:** count characters with `.chars().count()`, never `.len()` on a
   `String`/`&str` (byte length). Cursor/insert/delete indices are CHAR indices.
3. **Nightly toolchain:** the workspace requires nightly Rust (see `rust-toolchain.toml`).
   Do not change the channel.
4. **`cargo test --lib`:** unit tests run with `--lib` (per `server/AGENTS.md`). Add your
   tests in `#[cfg(test)] mod tests` or a sibling `tests.rs`.
5. **No HTML conversion:** this is the canvas-native OOXML architecture. Do not introduce
   TipTap/ProseMirror/contentEditable dependencies.
6. **`wo-command` events:** frontend formatting flows through
   `window.dispatchEvent(new CustomEvent("wo-command", {detail:{command,value}}))`.
7. **Biome** for TS/TSX, **ESLint** only for legacy JS. `cargo clippy` must stay clean.

## Definition of Done (per engine)

See plan §13. In summary your change must:
- Compile (`cargo build` / `wasm-pack build` / `pnpm build` as appropriate)
- Pass the acceptance gate command above
- Add the tests specified in {{PLAN_SECTION}}
- Not break any existing workspace `--lib` test

{{PREVIOUS_ERROR}}
{{EPISODES}}
{{MISSION}}

## If you are a merge-conflict retry

Your previous attempt passed the acceptance gate but failed to merge because
main advanced while you worked (conflicting files are named in the error
above). Your work is **preserved on this branch**. Do this:
1. Run `git rebase main` — resolve any conflict markers in the named files
   (keep BOTH your work and the new main changes where they don't collide).
2. Re-run the acceptance gate; it must pass on the rebased code.
3. Commit the resolution and finish as normal.

## HARD REQUIREMENT: you MUST modify files

Your task is judged ONLY by real file changes in your scope. The orchestrator
checks `git diff` against the base commit before running the gate.

**If you do not modify at least one in-scope file, the task FAILS immediately** —
regardless of what you write in your summary. Do NOT:
- Claim success without making changes (this is detected and counted as a failure)
- "Provide the commit message" or "report completion" as a substitute for work
- Stop after reading files / analysis only

If the task is too large, do it in this order and commit progressively:
1. Make the minimal correct change that compiles
2. Run the acceptance gate
3. If green, commit. If red, fix and re-run.
4. Only if you genuinely cannot make it compile after real attempts should you
   commit nothing and report the blocker.

## When finished

1. Run the acceptance gate. It must be green.
2. `git add -A` the files in your scope (and ONLY those).
3. Commit with message: `feat(AF4-LAYOUT-COMPLETE): Layout tab to OO parity: Columns/Breaks dropdowns, object ops (Wrapping/Align/Bring/Send/Group/Merge Shapes), Size presets to OO set`
4. Reply with a concise summary:
   - What you implemented (1–4 bullets)
   - Test count added/passed
   - Any deviation from the contract and why
   - Any follow-up needed

Do not push; the orchestrator merges and pushes.


## File scope (auto-appended)
apps/web/apps/documenteditor-wysiwyg


## Acceptance criteria (auto-appended)
Parity slice: OO 9.4 Layout tab vs WO. Gap source: wo-test-harness census/census/oo-deep-gap.md (layout deficit 13).

VERIFIED STATE OF THE WORLD (probe to confirm, but these are current):
- Editor = vanilla JS app: apps/web/apps/documenteditor-wysiwyg/{index.html, editor.js, i18n.js, style.css}. Ribbon pages are <div class="ribbon-page" data-tab="layout"> (index.html ~line 479).
- Layout tab TODAY has: btn-page-break, btn-section-break, btn-columns (plain button), Margins/Size/Orientation dropdown menus using <span class="menu rb-menu"><button class="menu-trigger caret-btn"> + <ul class="menu-list"> with rows <button data-cmd="applyPageMargins|applyPageSize|applyPageOrientation" data-value="..." data-i18n="...">, btn-page-setup, toggleHyphenation, toggleLineNumbers, toggleWatermark, pagecolor input, themecolors select.
- Size menu currently has only 4 presets (A4/Letter/Legal/A5); OO has 14 (US Letter, US Legal, A4, A5, B5, Envelope #10, Envelope DL, Tabloid, A3, Tabloid Oversize, ROC 16K, Envelope Choukei 3, Super B/A3, Custom page size).
- i18n.js: every visible label needs a key in BOTH en and de maps (Ctx.*, Layout.* pattern). Missing key in either locale = broken contract.
- Tests are node built-in runner, zero deps, static analysis of index.html/editor.js/i18n.js — mirror ctx-menu.test.mjs and layout-menus.test.mjs style.

OO LAYOUT REFERENCE (from census capture, rows OO has that WO lacks):
- Columns dropdown menu: One / Two / Three / Left / Right / Custom columns
- Breaks dropdown menu: Insert page break / Insert column break / Insert section break
- Object ops buttons (may be simple buttons or small menus): Wrapping, Bring Forward, Send Backward, Align, Group, Merge Shapes
- Margins menu in OO also has a 'Custom margins' row opening page setup

YOUR DELIVERABLES:
1. Columns: replace plain btn-columns with a dropdown menu (One/Two/Three/Left/Right + Custom columns -> btn-page-setup). data-cmd="applyColumns" with data-value one|two|three|left|right. Add applyColumns handling in editor.js: set a [data-columns] marker / page columns attr consistent with existing column handling (grep editor.js for columns first — btn-columns already does something; reuse its logic path).
2. Breaks: add a 'Breaks' dropdown (page/column/section) KEEPING the existing btn-page-break/btn-section-break ids wired as menu rows or keep the buttons and add the menu — follow which is closer to OO (OO has ONE menu). Column break = insert a column-break marker consistent with how page/section breaks insert markers.
3. Object ops: add Wrapping, Bring Forward, Send Backward, Align (dropdown: left/center/right + top/middle/bottom), Group, Merge Shapes (dropdown: union/subtract/intersect) controls to the Layout tab. These operate on div.object selections (grep editor.js for .object / selection). If real object-manipulation commands don't exist yet, write a console marker event consistent with the established marker pattern (editor.js line ~590: events + console markers that Playwright waits on) — e.g. wo:object-op {op, value}. Honest stubs that fire real observable events are acceptable; bare console.log stubs are NOT.
4. Size menu: extend to the full OO preset list (14 rows), each data-cmd="applyPageSize" with data-value. Check editor.js applyPageSize handles new sizes (add mm dims map if needed).
5. Margins menu: add 'Custom margins' row that triggers btn-page-setup behavior.
6. i18n: every new visible label needs data-i18n key + en + de entry.
7. New test file layout-objectops.test.mjs (or extend layout-menus.test.mjs): assert (a) columns menu exists with 5 preset rows + custom, (b) breaks menu has 3 rows, (c) object-op controls exist and every data-cmd value is dispatched in editor.js, (d) every new data-i18n key exists in BOTH en and de, (e) size menu has >= 13 rows, (f) no handler body is a bare console.log stub.
8. Run ALL *.test.mjs in the dir until green (node is on PATH). Do not break any existing test.
9. Commit on the current branch: 'feat(AF4-LAYOUT-COMPLETE): Layout tab OO parity — Columns/Breaks menus, object ops, full Size presets' + short body.

Worktree layout: you are at the monorepo root; paths above are relative to it.


## Acceptance gate command (auto-appended)
cd apps/web/apps/documenteditor-wysiwyg && for t in *.test.mjs; do node "$t" > /dev/null || { echo "FAIL $t"; exit 1; }; done
