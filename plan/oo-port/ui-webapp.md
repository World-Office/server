# ORM-09 — OO document UI layer → WO editor.js: UI coverage map

Source of truth: `/tmp/oo-src` (read-only) = OnlyOffice **web-apps** word editor
(`documenteditor/main/app` + shared `common/main/lib`). Target of the map: THIS
worktree's WO UI — `apps/web/apps/documenteditor-wysiwyg/{editor.js,index.html,i18n.js,style.css}`
(14,516 lines of editor.js + 3,589 lines of index.html + 2,321 lines of i18n.js).
Machine-readable companion: `plan/oo-port/ui-webapp.json` (217 rows; every
`oo_file` verified to exist on this host; anchors verified by grep against
editor.js/index.html — line numbers cited below are from this worktree).

## How WO hosts OO UI (architecture deltas)

OO is Backbone MVC: a controller registers SDK `api` events and DOM events, a
view binds a template, and `Common.UI` widgets (Window, Menu, DataView, …) give
dialogs rich behavior. WO collapses all of that:

- **Controllers** disappear. Event wiring is one IIFE per feature area inside
  `editor.js`; dialogs are static `<div id="…-dialog">` blocks in `index.html`
  registered in `DIALOG_IDS` (editor.js L2041, 65 ids) with a central
  `getOpenDialog()` (L2042), `DIALOG_CLOSE` (L2056), Esc handling (L2072) and a
  manual Tab focus trap (L2086).
- **Views+templates** become static HTML. `Toolbar.template`/`ToolbarView.template`
  → `#toolbar` markup (index.html L186); `RightMenu.template` → `#right-panel`
  with five `rp-section` blocks (L1100–1281); `FileMenu.template` →
  `#backstage-overlay` (L1344); `StatusBar.template` → `footer.statusbar` (L1297).
- **Widgets** become native elements: `ComboBox`→`<select>`, `CheckBox`/`RadioBox`
  → native inputs, `Window`→`.dialog-overlay`, `Slider`→`input[type=range]`,
  `Calendar`→`input[type=date]` (custom calendar is a **missing** row).
- **Commands** flow through `runCommand(cmd, value)` (editor.js L1019) and
  `emitCommand()`/`wo-bridge.js` — the moral equivalent of OO calling
  `window.asc_*` SDK methods (see ORM-01 `plan/oo-port/wasm-api.json`).

`wo_status` semantics used in the JSON: `full` (behavior-equivalent surface
exists), `partial` (surface exists but options/behaviors are missing — see
notes), `missing` (no WO counterpart), `merged-into-editor.js` (OO's
controller/view/template split has no separate WO artifact; the anchor is a
function or markup region).

## Scoreboard (217 rows)

| oo_type | rows | full | partial | missing | merged |
|---|---|---|---|---|---|
| controller | 41 | 9 | 18 | 9 | 5 |
| view | 109 | 34 | 37 | 34 | 4 |
| model | 3 | 1 | 1 | 1 | 0 |
| collection | 3 | 2 | 1 | 0 | 0 |
| template | 27 | 6 | 9 | 10 | 2 |
| common-component | 34 | 8 | 17 | 5 | 4 |
| **total** | **217** | **60** | **83** | **59** | **15** |

Every row carries an extra `oo_layer` field (`documenteditor` 115 rows vs
`common` 102 rows) so the documenteditor-app surface and the shared
`Common.UI` widget layer stay distinguishable inside the six-value `oo_type`
enum.

Census of the OO side mapped here: 18 controllers (`Toolbar.js` 4,415 lines,
`Main.js` 3,533, `DocumentHolderExt.js` 3,086, `LeftMenu.js` 1,061,
`RightMenu.js` 651, `Print.js` 651, `Links.js` 603, `ViewTab.js` 478,
`FormsTab.js` 893, `Search.js` 511, `DocumentHolder.js` 720, `PageLayout.js`,
`Navigation.js`, `PageThumbnails.js`, `Statusbar.js`, `Viewport.js`,
`DocProtection.js`, `HeaderFooterTab.js`) and 65 views led by
`FileMenuPanels.js` 3,414, `ImageSettingsAdvanced.js` 3,322,
`DocumentHolderExt.js` 2,920, `ShapeSettings.js` 2,449,
`TableSettingsAdvanced.js` 2,179, `FormSettings.js` 2,084,
`ParagraphSettingsAdvanced.js` 1,640, `TextArtSettings.js` 1,513,
`ListSettingsDialog.js` 1,383, `DropcapSettingsAdvanced.js` 1,177,
`ChartSettings.js` 1,134, plus 27 templates, 3 models and 3 collections, and
the shared `common/main/lib` widget library (45 components / 25 controllers /
53 views). The JSON covers 217 of the ~237 files — the unmapped remainder is
sub-view scaffolding (BaseView-style helpers, per-widget test fixtures) with
no independent UI behavior.

## Missing UI panels ranked by OO source size (the port backlog)

| OO class (view) | lines | What WO cannot do today | wasm calls the panel would drive |
|---|---|---|---|
| `ImageSettingsAdvanced` | 3322 | no crop, no brightness/contrast adjust, no rotation dial, no wrap-boundary editing, no replace-from-URL | `asc_ChangeCropState`, `asc_getCropOriginSize`, `asc_getWrapText`, `asc_putAnnotProps` |
| `ShapeSettings` | 2449 | no shape fill/line/shadow styling panel; WO can only insert fixed SVG shapes (`selectShape()` L3887, `createShapeSvg()` L3946) | `asc_getGradientStops`, `asc_CGradientFill`, `asc_CShadowProperty`, `asc_putStrokeStyle`, `asc_putLinebeginstyle`, `asc_putLineendstyle` |
| `TableSettingsAdvanced` | 2179 | no cell margins, no text-flow-around-table, no repeat-header-row, no border-painting styler | `asc_putBorderStyle`, `asc_putBorderWidth`, `asc_CFormatTableInfo`, `asc_getTableStyleName` |
| `FormSettings` + `FormsTab` (view 2084 + controller 893) | 2977 | no form modes, role manager, filling status, send-for-signing | `asc_getForm`, `asc_addRole`, `asc_editRole`, `asc_getAllRoles`, `asc_canFillRole` |
| `TextArtSettings` | 1513 | no WordArt transform gallery / text-art styling | `asc_putStyle`/`asc_setStyle`, `asc_CGradientFill` |
| `ReviewPopover` | 1406 | no anchored per-thread comment popover (panel-only editing) | `asc_addReply`, comment data class `asc_CCommentDataWord` |
| `ChartSettings` remainder + `Charts3DDlg` | 1134+ | no series/data-range/axis/legend/3D editing | `asc_putCategory`, `asc_canChangeAxisType` |
| `PdfSignDialog` | 657 | no PDF signing flow | `asc_getSigner1`, `asc_getSigner2`, `asc_getSignatureImage` |
| `FormatSettingsDialog` | 702 | no number-format pattern editor | `asc_CFieldNumberFormatProperty`, `asc_getFormatCode`, `asc_getNumFormatInfo` |
| `HintManager` | 829 | no onboarding hints | n/a (pure UI) |
| `ShortcutsEditDialog` | 526 | shortcut re-binding absent | n/a |
| `Calendar` (widget) | 503 | no custom date picker (native input only) | n/a |
| `HSBColorPicker` + `ExtendedColorDialog` | — | picker widget ported (P3-U01 `wo-dialogs.js`); no consumer dialog spec yet | `asc_putColor` |
| `MultiSliderGradient` | 381 | widget ported (P3-U01 `wo-dialogs.js`); shape/textart fill specs pending (P3-U03) | `asc_getGradientStops` |
| forms/signing tail: `RolesManagerDlg`, `RoleEditDlg`, `RoleDeleteDlg`, `SaveFormDlg`, `SendForSigningSettings`, `FillingStatusSettings`, `MailMergeEmailDlg`, `SignatureSettings`, `SignDialog`, `SignSettingsDialog`, `DocumentAccessDialog`, `RenameDialog`, `CopyWarningDialog`, `TextInputDialog`, `SelectFileDlg`, `CustomizeQuickAccessDialog`, `ShapeShadowDialog`, `ExternalEditor` family, `Draw`, `PageThumbnails` (+`Pages` model), `StyleTitleDialog`, `FootnoteTip`, `SynchronizeTip`, `LoadMask`, `MonacoEditor`, `MaskedField` | — | clustered absences (docxf forms, signing, external editors, ink, thumbnails) | see wasm-api.json rows `asc_getAllRoles`…`asc_getForm`; thumbnails need paginated raster (ORM-04 severity-3) |

61 of 217 rows were `missing` at ORM-09 time; 59 remain (the dialog engine
below closed the two pure-widget absences). The large-block backlog is the
first table above
(`ImageSettingsAdvanced` → `TextArtSettings` ≈ 12.5k lines of OO view code
without a WO counterpart, plus their 5 templates).

## Dialog engine status (P3-U01, landed)

Step 0 of the recommendation above is done: `wo-dialogs.js` (ES module,
loaded from index.html) ships the data-driven `WoDialogEngine` —

- `build(spec)` renders `{ id, title, titleKey, width, sections:
  [{ title, titleKey, rows: [{ type: button|checkbox|number|select|text|
  color|custom, key, label, labelKey, min, max, step, options, value, cmd,
  widget }] }], okCmd }` as the same `.dialog-overlay`/`.dialog` DOM the
  static dialogs use; every built id registers into `DIALOG_IDS` via the
  `woRegisterDialogId()` seam (plus a `__WO_PENDING_DIALOG_IDS__` drain for
  module-vs-editor boot order), so the modal Tab trap + global Esc close
  apply unchanged.
- Command rows emit `data-wo-cmd` + `wo-command` CustomEvents (OK applies
  the whole value snapshot as one JSON ledger entry) — `runCommand()` /
  `recordCommand()` / `replayCommands()` consume them without changes.
- i18n via `data-i18n` + the real catalogs (engine chrome `Dialog.Ok/Title`
  and all `Widget.*` strings exist in en + de in i18n.js); the engine also
  seeds only-missing pairs using the `seedUiStrings()` pattern and resolves
  the shared instance through the `window.__WO_I18N_T__` seam.
- The three widget prerequisites are ported as custom row factories in the
  same file: `tableStyler()` (24-segment border-painting grid with
  style/width/color pen), `hsbColorPicker()` (H/S/B sliders + hex + preview),
  `multiSliderGradient()` (draggable stops, track-click add, remove with a
  ≥2-stop floor). All three are import-safe headless (pure value state) and
  gated by `wo-dialogs.test.mjs` (`WO-DIALOGS-PASS`).

Consumer dialog specs land next: `TableSettingsAdvanced` +
`ImageSettingsAdvanced` (P3-U02), then `ShapeSettings`/`ReviewPopover`/
`ExtendedColorDialog` (P3-U03).

## What WO already covers well (60 `full` rows)

Dialog-level parity is essentially complete for the "classic Word dialog" set:
`#link-dialog` (HyperlinkSettingsDialog), `#bookmark-dialog` (BookmarksDialog),
`#caption-dialog` (CaptionDialog), `#datetime-dialog` (DateTimeDialog),
`#crossref-dialog` (CrossReferenceDialog), `#columns-dialog`
(CustomColumnsDialog), `#watermark-dialog` (WatermarkSettingsDialog),
`#page-setup-dialog` (PageMarginsDialog+PageSizeDialog), `#pagenumber-dialog`
(PageNumberingDlg), `#linenumbers-dialog`, `#hyphenation-dialog`,
`#table-dialog` (InsertTableDialog), `#table-to-text-dialog`/`#text-to-table-dialog`,
`#formula-dialog` (TableFormulaDialog incl. `evalFormula()` L2495 and
`recalcTableFormulas()` L2522), `#numbering-value-dialog` + `#list-indents-dialog`,
`#protect-dialog` (ProtectDialog/PasswordDialog), `#symbol-dialog`
(SymbolTableDialog L8912), `#autocorrect-dialog` (AutoCorrectDialog),
`#find-dialog` (SearchPanel/Search controller), `#nav-panel` (Navigation trio),
`#chat-panel` (Chat), `#version-history-dialog` (History),
`#comments-panel` (Comments view/controller), `#backstage-overlay` shell
(FileMenu) with `#backstage-recent` (RecentFiles) and `#backstage-shortcuts`.

Right rail parity: `#right-panel` + `#right-rail` (RightMenu controller+view)
with paragraph/table/image/chart/mailmerge `rp-section`s covers
`ParagraphSettings` fully and the *simple* halves of `TableSettings`,
`ImageSettings`, `ChartSettings`, `MailMergeSettings`.

## Partial rows — the long tail of hidden feature gaps (81 rows)

Representative one-liners (full notes in the JSON):

- `Toolbar` controller/view+templates → static `#toolbar`; no contextual
  ribbon tabs (OO swaps tabs when the caret enters header/footer/table/image
  context; WO uses `#headerfooter-dialog` + `openTableOps()` instead).
- `ParagraphSettingsAdvanced` → `#paragraph-settings-dialog` (L5162) +
  `#tabs-dialog` (L5205); missing line-break rules (kerning/ligatures,
  East-Asian linebreak).
- `ListSettingsDialog`/`ListTypesAdvanced` → three dialogs
  (`#bullets-numbering-dialog`, `#list-indents-dialog`,
  `#numbering-value-dialog`); no per-level custom marker font/color.
- `DocumentHolder`/`DocumentHolderExt` → `#ctx-menu` (L1523) +
  `applyObjectOp()` (L3561); no anchored/floating holder, no fly-out submenus.
- `Print` → `doPrint()` (L755) only; OO's `PrintWithPreview` panel
  (FileMenuPanels.js L2736) with page ranges absent.
- `FileMenuPanels` → backstage covers new/open/export/info/settings/protect/
  help/shortcuts; missing SaveCopy, DocumentRights, CreateNew gallery.
- `ControlSettingsDialog` → `#cc-dialog`; no dropdown/radio/complex controls.
- `Comments` controller → threads/resolve/replies yes; realtime per-user
  editing states no.
- `ReviewChanges` → accept/reject/navigate yes; inline/balloon display modes
  and per-reviewer filters no.
- `Plugins` → `#plugins-dialog` + `#background-plugins-dialog`; no iframe
  plugin runtime.
- `Mixtbar`/`Menu` → toolbar dropdowns single-level; no compact responsive
  toolbar modes, no keyboard menu walking.

## How editor.js should host the missing panels (data-driven dialogs)

Today every WO dialog is hand-written HTML plus bespoke handler code — the
same dialog duplicated twice (rail section + modal) drifts apart. The 12.5k
lines of missing OO view code above must **not** be re-entered as hand HTML.
Recommendation: declare dialogs as data and render them.

1. **A dialog schema registry.** Extend the `DIALOG_IDS` array (editor.js
   L2041) into a registry: `{ id, title, i18n, fields: [{type, key, label,
   min, max, options, bind}], onOpen, onApply }`. `openOverlayDialog()` /
   `closeDlg()` already give the modal lifecycle; `getOpenDialog()` gives
   focus trapping. A ~300-line renderer would emit the same DOM
   `.dialog-overlay` blocks for new dialogs, and `#paragraph-settings-dialog`
   / `#page-setup-dialog` / `#columns-dialog` can be migrated onto it to
   prove the model without touching `runCommand()`.
2. **Field binding = asc_* calls (ORM-01 contract).** Each field's `bind`
   names the wasm export the apply button drives, e.g. the future
   `ImageSettingsAdvanced` dialog binds crop fields to
   `asc_ChangeCropState`/`asc_getCropOriginSize`, wrap fields to
   `asc_getWrapText`; `ShapeSettings` binds gradient stops to
   `asc_getGradientStops`/`asc_CGradientFill` and shadow to
   `asc_CShadowProperty`. That keeps UI and engine decoupled exactly like
   OO's `view → api.asc_*` call graph — the UI never computes document
   state itself.
3. **Preserve the two existing extension points.** `data-wo-cmd` dispatch
   (index.html L463…) for button-level commands and `i18n.js` keys via
   `data-i18n`/`seedUiStrings()` (editor.js L197) must stay, so new
   data-driven dialogs inherit localization and the command ledger
   (`recordCommand`/`replayCommands`, L4569/4585) for free.
4. **Backbone not needed.** OO uses Backbone for view lifecycle and SDK event
   fan-out; WO's DOM-event + explicit function-call style is equivalent for
   dialogs. The three OO widgets that needed real ports before the dialog
   engine — `TableStyler` (border painting), `HSBColorPicker` (custom
   colors), `MultiSliderGradient` (gradient stops) — landed with P3-U01 in
   `wo-dialogs.js` (see "Dialog engine status" above).

## Port order recommendation (wasm-contract-first)

The right order maximizes UI coverage per wasm export already specified in
ORM-01 (`plan/oo-port/wasm-api.json`, 970 asc_* methods):

1. **`TableSettingsAdvanced`** — every field maps to exports that already
   exist or are trivially added (`asc_putBorderStyle`, `asc_putBorderWidth`,
   table info classes). Tables are WO's weakest render surface today; the
   dialog would also unlock `TableStyler`-style border painting.
2. **`ImageSettingsAdvanced`** — crop/adjust/rotation are pure engine calls
   (`asc_ChangeCropState`, `asc_getCropOriginSize`); the rail image section
   already exists as the mount point (`rp-section image`, index.html L1186).
3. **`ShapeSettings`** — needs `asc_CGradientFill`/`asc_getGradientStops`
   plus the `MultiSliderGradient` widget port; do it after the dialog engine
   (step 0 above) so fill/line/shadow sections render from data.
4. **`ReviewPopover`** — pure UI (comment threading exists in
   `renderCommentsList()` L4429); biggest UX parity win per line of code.
5. **Forms/signing family** — blocked: requires the docxf format layer
   (ORM-05 records the format gap) and roles exports (`asc_addRole`,
   `asc_getAllRoles`); schedule last.
6. **`PageThumbnails` + `Print` preview** — blocked on paginated raster
   output from the engine (ORM-04 flags page-model/rendering as
   severity-3); the `Pages` model row in the JSON is the anchor for it.

## Method

- Enumerated `/tmp/oo-src/documenteditor/main/app/{controller,view,model,collection,template}`
  and `/tmp/oo-src/common/main/lib/{component,controller,view}` with
  `wc -l` for the size ranking (all counts quoted above are from this host).
- Verified each `oo_file` with `fs.accessSync` (217/217 exist) and each
  `wo_anchor` against this worktree by grep (DIALOG_IDS L2041, dialog
  open sites, `rp-section` markup, backstage ids).
- Cross-mapped WO coverage using `DIALOG_IDS` (65 dialog ids), the 70
  dialog-bearing ids in `index.html`, the five `rp-section` rail sections,
  and the ~528 top-level functions in `editor.js`.
- The wasm-callable columns cite names from `/tmp/oo-asc-api.txt`
  (970 unique asc_* methods — the same set ORM-01 ships as
  `plan/oo-port/wasm-api.json`).
