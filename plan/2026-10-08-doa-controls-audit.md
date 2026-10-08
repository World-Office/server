# Watchdog: DOA GUI controls vs the OnlyOffice reference

**Date:** 2026-10-08
**Scope:** `apps/web/apps/documenteditor-wysiwyg` — every visible/clickable
control that had *no function* at audit time, matched against the OO reference
(`/tmp/oo-src/Toolbar.js`, OO web-apps Common UI view) and the WO converters'
existing round-trip capabilities.

## Method

For every `<button>`/`<select>` id in `index.html` we checked two independent
wiring paths:

- `data-cmd` present → bound by the delegated dispatch
  (`editor.js:2781` `btn.addEventListener("click", () => emitCommand(...))`
  → `wo-command` bus → `runCommand`, `editor.js:2316`), plus active-state echo
  at `editor.js:1213`.
- A direct handler reference (`getElementById`/`querySelector('#id')`) in
  `editor.js`.

A control is **DOA** iff it has neither. Working controls may still be silent
in this grep because they are bound via `data-cmd` delegation.

## Round 1 fix (landed now): the notes/header/page-number buttons

`runCommand` has **long supported** `insertFootnote`, `insertEndnote`,
`insertHeader`, `insertFooter`, `insertPageNumber` (F-073/F-074/F-084/F-085),
and the DOCX/ODT converters round-trip the exact HTML markers
(`sup.footnote-citation + span.footnote`, `header.page-header`,
`footer.page-footer`, `span.page-number`). The DOM buttons existed but were
**never given `data-cmd`** → dead even though the whole pipeline was ready.
Added the `data-cmd` attributes (smallest diff, no JS change).

Live probe (`census/probe-wire.cjs`) on a spawned docserver:

```
OK header:<header>        (Insert tab)
OK footer:<footer>
OK footnote:<sup>          (References tab)
OK endnote:<sup>
OK page-number:<span>
```

## Still DOA (audit — not yet wired)

Grouped by what the OnlyOffice reference does; dependency noted so each is a
bounded future slice. None are one-attribute fixes like Round 1 — each needs a
little runtime (a selection model, a dialog apply-path, or a command).

### A. Table operations — `op-*` (index.html ~line 712, table toolset)
`op-row-above / op-row-below / op-col-left / op-col-right / op-del-row /
op-del-col / op-merge / op-split`
OO equivalent: table right-click toolbar "Insert Rows Above/Below / Insert
Columns Left/Right / Delete Row/Column / Merge Cells / Split Cell", driven by
the table cursor-selection model.
WO status: **do not exist** — needs table cell-hit + a `runCommand("tableOp",
…)` applying a DOM table transform (perssistible/round-trippable). Sizable.

### B. Object layout (shape/image/textart) — index.html ~line 1680+
`btn-align-left/center/right` (`data-objalign`) · `btn-wrap-inline/square/
behind` · `btn-layer-front/back`
OO: object contextual toolbar when an object is selected (align / wrap /
bring-forward / send-back). OO view lists `id-toolbar-btn-align-left/right/
center` and border/wrap controls.
WO status: pure `data-objalign`/`data-wrap`/`data-layer` DOM but **no object
selection model exists** (no shapes/drawings are rendered in the wysiwyg
canvas yet). Wiring them is premature — YAGNI until objects can be selected.

### C. Dialog apply-paths — X-ok / X-close pairs (all DOA)
`colors`, `dropcap`, `watermark`, `pagecolor`, `linenumbers`, `hyphenation`,
`displaymode`, `updatetoc`, `pagenumber`, `headerfooter`, `notes`,
`trackchanges`, `addtext`, `btn-insert-more`
OO: each is a modal whose OK applies a setting to the selected/whole document.
WO status: the dialog **markup** exists; the triggers don't open them and the
OK/Apply have no target (e.g. `toggleDropcap`/`openBorders` commands exist in
menus but the dialog apply is unbound). Needs per-dialog: open trigger + OK →
`runCommand`/DOM apply. The two with an existing command —
`toggleDropcap`, `openBorders` — are the cheapest next slice.

### D. File menu + app bar
`#menu-bar` `btn-file` submenu: `btn-new/open/print/history/export/fileinfo/
fileprotect/filesettings/filehelp/filesuggest` + `btn-save`
WO status: `btn-save` is wired (`:save`), `btn-undo-tb/btn-redo-qa` are wired
via `data-cmd`. The File **submenu items** that mutate/save (New/Open/Export/
Print/History) need host-bridge actions (New/Open/Export are real wopi/fs
ops). Split out the wired ones (Save/Undo/Redo/export=pdf/odt/html/docx exist
behind the export submenu) from the still-open ones.

### E. Ink / draw / AI-speech (status uncertain — re-inventory high-signal)
`btn-ink-*` (`toggleInk`/`inkMode`/`inkSelect` referenced in `editor.js:1226`)
and `btn-dictate/ocr/readaloud/speech`. The active-state echo already handles
`toggleInk`/`inkMode`/`inkSelect`, so Ink may be partially live; the AI-speech
cluster is unbound.

## Recommendation

Landed now: **Round 1** (notes/header/page-number). Next bounded slices, in
dependency order that each yields a user-visible, gated feature:

1. Table operations (A) — table cursor model + `tableOp` DOM transform.
2. Borders + Drop-cap dialogs (C) — both have an entry command already.
3. File submenu live items (D) — New/Open/Export/Print via host bridge.

Object layout (B) stays parked until objects exist. This audit is the
"analyse the OO code more closely" result: WO's converters already carry the
round-trip surface for notes/headers/page-number — the buttons were the only
missing link, and they are now wired.