# Dead-control audit — CORRECTED (2026-10-08)

**Bottom line:** *both* editors' command wires are essentially complete. The
first pass of this audit ("many elements have no function") was dominated by
false positives from a naive static grep. Corrected with **live isolated
clicks** (the only authoritative gate) plus confirming the three dynamic
binding patterns this codebase uses. Documenting them so no future audit
repeats the mistake.

## Why the first pass lied
A control is "dead" iff it is reachable *and* no click has any effect. Grepping
for `getElementById(...)` under-counts because binding here uses:

1. **Delegated `data-cmd`** — `editor.js:2781` binds every `button[data-cmd]`
   → `emitCommand` → `wo-command` → `runCommand`. The ids never appear.
2. **Object-literal key maps** — `tableOps = { "op-row-above": () => insertTableRow(true), … }`
   then `Object.keys(tableOps).forEach(...)` (`editor.js:2783`). The ids appear
   only as object keys, not in `getElementById`.
3. **String-concat ids** — `ROUND2 = [["dropcap", confirmDropcapDialog], …]`
   then `getElementById("btn-" + name + "-ok")` (`editor.js:5175`). The literal
   `"btn-dropcap-ok"` never appears verbatim.

Any audit claiming a control is dead must clear all three.

## Verified live (isolated clicks, wysiwyg editor)
All opened a dialog / changed content / set status — none inert:
`openBorders · toggleDropcap · insetCaption · insertCitation · insertObject ·
link · ocrRun · browsePlugins · photoEditor · aiSummarize · aiTranslate ·
aiRewrite (open AI propose) · toggleInk/inkMode · toggleNavigation`.
All 8 Layout dialogs' OK buttons are bound via ROUND2 and all 8 `confirm*Dialog`
functions exist. Table ops run end-to-end: injected 3×2 → `op-row-above` 4r →
`op-col-left` 4r×3c → `op-del-col` 4r×2c (merge needs a multi-cell selection by
design).

## Actually wired this session
Round-1 fix (previous turn) stays: `btn-pagenumber/header/footer` (Insert) and
`btn-footnote/endnote` (References) gained `data-cmd` → `insertPageNumber /
insertHeader / insertFooter / insertFootnote / insertEndnote`. The converters
round-trip the exact markers. Probe (`census/probe-wire.cjs`): 5/5 markers.

## React (= deployed docker/prod **:8082**) editor
`documenteditor-react`: `rte-command.ts` dispatcher switch covers **107/107**
`RichTextCommand` union members — zero unhandled. `structureOpForCommand`
(core-common) covers the WASM structure ops; `createWordCommandHandler`
(`word-commands.ts:162`) carries the word/object flavor (chart, macros,
watermark, pageColor, …). Both kernels are complete at the command layer.

## Genuine remaining dead candidates (narrow)
- **`Toolbar.tsx` is a 112-line wrapper** over `@world-office/editor-common`
  ribbon; the buttons live in `packages/editor-common/src/ribbon/`. If any
  ribbon button emits a literal command string that routes to none of
  `structureOpForCommand` / `rte-command` / `createWordCommandHandler`, the
  click is silent. That is the single remaining place to hunt "GUI elements
  without function" — and it must be settled **by clicking**, then diffing the
  dispatched command against the three handlers, not by grep.
- The unreachable `*.dialog-overlay` scaffolding and the object-layout
  `btn-align-*/wrap-*/layer-*` (no object model yet — YAGNI) are inert but not
  user-facing.

## Method rule (for the team)
Feature/dialog work must verify by **live isolated click → observable effect**
content delta / `.open` dialog / status text. Static grep is only a
hypothesis-generator here.