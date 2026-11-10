# ORM-01 — OO word SDK `asc_*` API surface → WO wasm export spec (KEYSTONE)

Artifact pair: **`plan/oo-port/wasm-api.json`** (970 rows, machine-readable port contract) and this report.
Sibling artifacts: `wasm-events.json` (ORM-02, the SDK→UI callback half), `wasm-data-classes.json`
(ORM-03, the `asc_C*` payload half), `engine-internals.json` (ORM-04, engine internals).

## 0. Verdict

The OnlyOffice word SDK exposes **970 unique `asc_*` names** in its bundle. The WO renderer wasm
boundary (`core/crates/wo-renderer-wasm/src/lib.rs`) exposes **35 `#[wasm_bindgen]` exports**, of
which only **3 cover a row of this surface** (`insert_text` ← `asc_enterText`, `spell_check_word` ←
`asc_IsSpellCheckCurrentWord`, `serialize_document` ← `asc_Save`). **967 of 970 rows are
`wo_missing = true`.** The keystone finding of this map: the wasm boundary today is a *renderer*
boundary, not an *editing-engine* boundary; reaching the OO port contract means growing exports
along the `asc_*` families listed below — priority order in §6.

## 1. Method (all commands re-runnable)

```sh
# (1) the unminified word SDK bundle
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/word/sdk-all.js /tmp/sdk-word.js
wc -l /tmp/sdk-word.js          # 852249 lines, 28M

# (2) the unique asc_* surface (VERIFIED: exactly 970, cross-checked 1:1 with the bundle)
grep -oE 'asc_[A-Za-z0-9_]+' /tmp/sdk-word.js | sort -u > /tmp/oo-asc-api.txt
grep -oE 'asc_[A-Za-z0-9_]+' /tmp/sdk-word.js | sort -u | wc -l   # 970

# (3) UI caller counts — OO web-apps word controllers (18 files)
ls /tmp/oo-src/documenteditor/main/app/controller/*.js | wc -l   # 18
#   Toolbar.js, Main.js, DocumentHolderExt.js, FormsTab.js, LeftMenu.js, Links.js, Print.js,
#   DocProtection.js, HeaderFooterTab.js, Search.js, PageLayout.js, Navigation.js, ViewTab.js,
#   Statusbar.js, RightMenu.js, PageThumbnails.js, DocumentHolder.js, Viewport.js
#   -> per-name word-boundary match count + per-file attribution (ui_caller_count/ui_caller_files)

# (4) WO exports — every `pub fn` following a #[wasm_bindgen] in the crate
grep -n 'wasm_bindgen' core/crates/wo-renderer-wasm/src/lib.rs    # 35 pub fn found

# (5) classification (node script, single pass over the bundle + controllers)
#   - sdk_ref_count: multiset of all asc_* tokens in the bundle
#   - defining-class attribution: `X.prototype.asc_y =` and `prot = X.prototype` / `prot.asc_y =`
#     scans -> 52 distinct defining classes; data-class members inherit the class family group
#   - side: verb prefix (asc_get*/is*/can*/has* = engine-query; asc_put*/set*/change*/update* =
#     engine-mutation; asc_C[A-Z]* = data-class-ctor; asc_on* = discovery event; check/find/register*
#     = discovery; the rest = object-op)
#   - group: ordered regex rule table (28 groups) with class-family fallback
```

## 2. Surface composition — why 970 is not "970 UI-driven engine calls"

| composition slice | rows | meaning for the wasm contract |
|---|---|---|
| rows with ≥ 1 word-UI caller | **74** | the real `api.asc_*` traffic the web-apps word UI drives |
| rows with 0 word-UI callers | **896** | in-surface but not driven by the word UI |
| data-class member accessors (`member_of` set) | **510** | members of `asc_C*` objects (e.g. `asc_getR/asc_putB` on `asc_CColor`); they cross the boundary **inside the struct payloads** (ORM-03), not as standalone exports |
| SDK→UI event callbacks (`asc_on*`) | **101** | must be **re-emitted by** the wasm engine; spec'd in `wasm-events.json` (ORM-02) |
| shared-bundle leakage (group `other` + spreadsheet/pdf slices) | ~301 | spreadsheet engine (sort/filter/pivot/solver/defnames/external-refs/xfs), PDF annot props, plugin & macro plumbing — `sdkjs` bundles `AscCommonExcel`/`AscFormat` into `sdk-all.js`; not part of the word-UI contract |

Absences worth recording (they shape the contract):

- `asc_Undo` / `asc_Redo` are **not** in this surface — undo/redo enter the word engine through the
  common api base (`api.Undo()`, `api.Redo()`; the word controllers call them 2× each) plus
  `asc_undoAllChanges` (2 UI calls, defined in the shared api layer, outside this bundle).
  WO's `undo`/`redo` exports therefore cover **no** row of the 970 — they are still required exports.
- `asc_getSelectedText` is absent (that is a spreadsheet editor name); the word UI reads selection
  text through the api layer. WO `get_selected_text` remains required.
- `asc_Save` is defined in the shared api layer and only *referenced* in the word bundle — the
  surface extraction correctly lists it.

## 3. Totals per group (970 rows, 28 groups)

| group | rows | group | rows | group | rows |
|---|---|---|---|---|---|
| other | 301 | image | 34 | collab | 15 |
| chart | 103 | field | 32 | review | 15 |
| shape | 101 | view | 25 | list | 14 |
| document | 72 | section | 19 | bookmark | 9 |
| run-format | 50 | protection | 17 | header-footer | 9 |
| content-control | 48 | paragraph | 16 | comment | 8 |
| table | 39 | selection | 16 | print | 7 |
| | | | | smartart | 5 |
| undo-redo | 4 | proofing | 2 | download | 2 |
| equation | 3 | scroll | 2 | zoom | 2 |

Per side: `engine-query` 401 · `engine-mutation` 298 · `discovery` 110 (101 of them `asc_on*`
events) · `object-op` 82 · `data-class-ctor` 79.

Reading: the OO boundary is **query-heavy** (401 getters) because OO keeps state *in* the JS engine
and the UI polls it on every selection change. A wasm port inverts this: state lives in Rust, so
most `engine-query` rows become either an export returning cached state or — better — a
**push event** carrying the same data (that is exactly the ORM-02 `WsEvent` design: replace poll
storms like the selection-change property refresh with one `selection_changed` frame).

## 4. The 35 existing WO wasm exports and their `asc_*` coverage

| # | WO export | covers `asc_*` | verdict |
|---|---|---|---|
| 1 | `init` | — | OO counterpart is `new Asc.asc_docs_api()` + host wiring; keep, extend for the session fields (docId/token/server version) |
| 2 | `render_page` | — | OO renders continuously inside the JS engine; WO splits rendering as an explicit export — documented divergence, keep |
| 3 | `create_document` | — | OO builds the model inside `asc_docs_api`; keep |
| 4 | `layout_document` | — | no `asc_*` counterpart (OO lays out during edit); keep |
| 5 | `render_laid_out_page` | — | idem |
| 6 | `release_document` | — | OO relies on GC; wasm needs explicit teardown; keep |
| 7 | `handle_mouse_event` | — | OO input handling lives inside the engine; keep |
| 8 | `handle_mouse_drag` | — | idem |
| 9 | `handle_key_event` | — | idem (this is where OO's internal delete/backspace lives — see `delete_selection`) |
| 10 | `insert_text` | `asc_enterText` | **1:1 covered**; recommend `js_name = "asc_enterText"` alias |
| 11 | `set_selection_anchor` | — | partial semantic overlap with OO internal selection state; extend to full range set |
| 12 | `get_selected_text` | — | required; no `asc_*` in word surface (§2) |
| 13 | `delete_selection` | — | required; OO does deletion via internal key handling |
| 14 | `undo` | — | required; OO uses common api `Undo()` + `asc_undoAllChanges` (§2) |
| 15 | `redo` | — | required; OO uses common api `Redo()` |
| 16 | `serialize_document` | `asc_Save` | **covered (byte half)**; upload/persistence half missing |
| 17 | `get_selection_rects` | — | required for caret/selection UI parity |
| 18 | `get_cursor_position` | — | required; OO surfaces it via `asc_onCursorMove` push |
| 19 | `apply_formatting` | — | no `asc_*` twin; OO applies `asc_C*` property blobs (§6 R3) |
| 20 | `get_run_formatting` | — | idem (OO: run/para property getters on selection) |
| 21 | `apply_structure_op` | — | WO op-model primitive; the natural home for table/list/section ops |
| 22 | `create_model` | — | WO-only (stub path) |
| 23 | `apply_op` | — | WO CRDT op model; no OO counterpart |
| 24 | `model_to_bytes` | — | idem |
| 25 | `layout_and_render` | — | WO combined fast path |
| 26 | `release_stub_model` | — | WO-only |
| 27 | `release_pdf_model` | — | WO-only (PDF form path) |
| 28 | `spell_load_dictionary` | — | required; OO loads dictionaries engine-internally |
| 29 | `spell_check_word` | `asc_IsSpellCheckCurrentWord` | **1:1 covered**; `js_name` alias recommended |
| 30 | `spell_suggest` | — | required (OO proofing context menu) |
| 31 | `spell_check_text` | — | required (batch check) |
| 32 | `spell_add_to_user_dict` | — | required |
| 33 | `spell_load_hyphenation` | — | required for paragraph hyphenation parity |
| 34 | `spell_hyphenate` | — | required |
| 35 | `spell_release` | — | WO teardown |

Coverage: **3 rows of 970** (0.3%). 32 of 35 exports cover zero rows — not because they are wrong,
but because OO's word surface never named those operations `asc_*` (rendering, input, undo/redo,
selection plumbing are engine-internal or live in the common api layer).

## 5. TOP-50 missing methods ranked by word-UI caller count

Every row below is `wo_missing = true` today. `ui` = word-UI call sites in
`documenteditor/main/app/controller/*`; `sdk` = references inside the word bundle.

| # | method | group | side | ui | sdk | UI callers |
|---|---|---|---|---|---|---|
| 1 | asc_registerCallback | other | discovery | 190 | 19 | DocProtection, DocumentHolder, DocumentHolderExt, FormsTab, HeaderFooterTab, LeftMenu, Links, Main, Navigation, PageLayout, PageThumbnails, Print, RightMenu, Search, Statusbar, Toolbar, ViewTab, Viewport |
| 2 | asc_CImgProperty | image | data-class-ctor | 14 | 33 | DocumentHolderExt, PageLayout |
| 3 | asc_enableKeyEvents | document | object-op | 14 | 13 | DocumentHolderExt, LeftMenu, Main, Print |
| 4 | asc_CColor | run-format | data-class-ctor | 11 | 30 | Toolbar |
| 5 | asc_getValue | other | engine-query | 11 | 8 | Toolbar |
| 6 | asc_setRestriction | protection | engine-mutation | 11 | 1 | DocProtection, FormsTab, Main |
| 7 | asc_getName | other | engine-query | 6 | 42 | DocumentHolderExt, FormsTab, Toolbar |
| 8 | asc_CRect | image | data-class-ctor | 6 | 7 | DocumentHolderExt |
| 9 | asc_setViewerTargetType | view | engine-mutation | 6 | 1 | Statusbar, Toolbar, ViewTab |
| 10 | asc_getColor | run-format | engine-query | 5 | 14 | DocumentHolderExt, FormsTab, Toolbar |
| 11 | asc_addImage | image | object-op | 5 | 1 | DocumentHolderExt, HeaderFooterTab |
| 12 | asc_coAuthoringDisconnect | collab | object-op | 5 | 1 | Main |
| 13 | asc_getHeight | shape | engine-query | 4 | 11 | DocumentHolderExt |
| 14 | asc_getObjectType | other | engine-query | 4 | 6 | DocumentHolderExt, HeaderFooterTab |
| 15 | asc_getWidth | shape | engine-query | 4 | 6 | DocumentHolderExt |
| 16 | asc_MoveToFillingForm | content-control | object-op | 4 | 1 | FormsTab |
| 17 | asc_onError | document | discovery | 3 | 41 | FormsTab, Main, RightMenu |
| 18 | asc_getUserName | collab | engine-query | 3 | 9 | LeftMenu, Main |
| 19 | asc_CParagraphProperty | paragraph | data-class-ctor | 3 | 5 | PageLayout, Toolbar |
| 20 | asc_CTextBorder | table | data-class-ctor | 3 | 4 | Toolbar |
| 21 | asc_onHideContentControlsActions | content-control | discovery | 3 | 4 | DocumentHolderExt, FormsTab, Links |
| 22 | asc_getImage | image | engine-query | 3 | 3 | Toolbar |
| 23 | asc_onShowContentControlsActions | content-control | discovery | 3 | 3 | DocumentHolderExt, FormsTab, Links |
| 24 | asc_setEditType | protection | engine-mutation | 3 | 3 | DocProtection |
| 25 | asc_AddMath | equation | object-op | 3 | 2 | DocumentHolderExt, Toolbar |
| 26 | asc_CUserInfo | collab | data-class-ctor | 3 | 2 | Main |
| 27 | asc_getAllRoles | content-control | engine-query | 3 | 2 | FormsTab |
| 28 | asc_getSettings | other | engine-query | 3 | 1 | FormsTab |
| 29 | asc_putColor | run-format | engine-mutation | 2 | 7 | FormsTab, Toolbar |
| 30 | asc_getUserId | collab | engine-query | 2 | 5 | LeftMenu |
| 31 | asc_getObjectValue | other | engine-query | 2 | 4 | DocumentHolderExt, HeaderFooterTab |
| 32 | asc_getEditType | protection | engine-query | 2 | 3 | DocProtection |
| 33 | asc_getSize | shape | engine-query | 2 | 3 | Toolbar |
| 34 | asc_getSolved | other | engine-query | 2 | 3 | LeftMenu |
| 35 | asc_setPassword | protection | engine-mutation | 2 | 3 | DocProtection |
| 36 | asc_getChartProperties | chart | engine-query | 2 | 2 | DocumentHolderExt |
| 37 | asc_onContextMenu | view | discovery | 2 | 1 | DocumentHolderExt, Toolbar |
| 38 | asc_onCurrentPage | other | discovery | 2 | 1 | FormsTab, Print |
| 39 | asc_isSupportFeature | document | engine-query | 1 | 6 | Main |
| 40 | asc_onSingleChartSelectionChanged | chart | discovery | 1 | 6 | DocumentHolderExt |
| 41 | asc_getOptions | other | engine-query | 1 | 5 | DocumentHolderExt |
| 42 | asc_putName | other | engine-mutation | 1 | 5 | FormsTab |
| 43 | asc_addRole | content-control | object-op | 1 | 4 | FormsTab |
| 44 | asc_getChartType | chart | engine-query | 1 | 4 | DocumentHolderExt |
| 45 | asc_onMarkerFormatChanged | view | discovery | 1 | 4 | Toolbar |
| 46 | asc_getCellCoord | other | engine-query | 1 | 3 | DocumentHolderExt |
| 47 | asc_getData | other | engine-query | 1 | 3 | Main |
| 48 | asc_getIsPassword | protection | engine-query | 1 | 3 | DocProtection |
| 49 | asc_getLastSelectedPasteProperty | other | engine-query | 1 | 3 | DocumentHolderExt |
| 50 | asc_getSectionId | section | engine-query | 1 | 3 | Toolbar |

Interpretation of the top ranks (this is why the "missing list" is plumbing-heavy): the word UI's
hottest `asc_*` traffic is (1) the **event-registration channel** (`asc_registerCallback`, 190 call
sites across all 18 controllers — every controller funnels its `on*` handlers through it), (2)
**data-class constructors** built at the UI side and handed to the engine (`asc_CImgProperty`,
`asc_CColor`, `asc_CRect`, `asc_CParagraphProperty`, ...), and (3) a handful of **engine-mutation**
entry points (`asc_setRestriction`, `asc_setViewerTargetType`, `asc_addImage`, `asc_AddMath`,
`asc_setEditType`, `asc_setPassword`). The classic word-formatting verbs (`asc_putAlign`,
`asc_setFontSize`, ...) barely appear as `asc_*` in the word UI because web-apps formats text
through non-asc api methods + `asc_C*` property objects — hence ORM-03 matters as much as this
export list.

## 6. Refactor recommendations — closing the gap

**R0 — event channel first (unblocks 190 call sites).** Add `register_callback` /
`unregister_callback` exports + the `WsEvent` enum frames from ORM-02. Without it, *every* UI
controller port is blocked; with it, the 101 `asc_on*` rows and the poll-heavy 401 `engine-query`
rows collapse into pushed frames.

**R1 — rename via `#[wasm_bindgen(js_name = ...)]` aliases, not Rust renames.** Keep Rust
snake_case; expose OO-faithful JS names for the rows already covered:
`insert_text` → `asc_enterText`, `spell_check_word` → `asc_IsSpellCheckCurrentWord`,
`serialize_document` → keep both (`asc_Save` semantics = serialize+persist; add a separate
`asc_Save` wrapper that also produces the upload payload), and add an `asc_undoAllChanges` alias
over `undo` (the coauth rollback the OO UI actually calls).

**R2 — session & document lifecycle exports** (covers `collab` 15 + `document` 72 core rows):
`asc_setDocId`/`asc_setToken`/`asc_setServerVersion`/`asc_setUrlChanges` equivalents, doc info
getters (core/app props), `asc_coAuthoringDisconnect`, `asc_getUserName/UserId`, `asc_isSupportFeature`.
Landed (P1-03, `wo-renderer-wasm::session`): the four connection-field setters (+`getDocId`/… pull
getters), identity (`asc_Set|putUserId`, `asc_Set|putUserName`, `asc_SetUserColor`,
`asc_getUserId`, `asc_getUserName`), the `asc_CUserInfo` blob as `WasmUserInfo`
(`getUserInfo`/`setUserInfo`), core-prop doc info as `WasmDocInfo` (`asc_getDocInfo` +
`asc_getTitle`/`asc_getCreator`/…/`asc_getCategory` per-field getters),
`asc_isSupportFeature` over a static capability table, and `asc_coAuthoringDisconnect`
(state flip + `WsEvent::CoAuthoringDisconnect` push). Still open in R2: app-props
(`asc_getAppProps`/`asc_getApplication`/`asc_getAppVersion`), statistics counters
(`asc_getCharacters`/`asc_getWords`/…), `asc_setDocumentSha256`. The `asc_CVersionHistory`
class landed P4-C01 as the `WasmVersionHistory` blob (`setVersionHistory`/`getVersionHistory`
over `AscCVersionHistoryEntry{version,author,date,label}`), alongside typed
`AscCUserInfo{id,name,initials,color}` and the protection pair
`setDocumentRestriction`/`getDocumentRestriction` (JSON `{mode, allowPrint, allowCopy}`,
modes `none|readOnly|comment-only|fill-forms|track-changes`, each set pushing
`WsEvent::RestrictionChange`).

**R3 — property-blob formatting exports** (the word UI's real formatting path): one
`set_property(kind, json)` + `get_property(kind)` pair consuming the ORM-03 serde structs
(`asc_CParagraphProperty`, `asc_CColor`, `asc_CTextBorder`, `asc_CPaddings`, ...) instead of 400+
individual getters/setters. Map `apply_formatting`/`get_run_formatting` onto this pair and mark
them the WO names for the whole `run-format`+`paragraph`+`table` property family (50+16+39 rows).

**R4 — structural ops via the existing op model.** Route `asc_addImage`, `asc_AddMath`,
`asc_setRestriction`, `asc_setEditType`, `asc_setPassword`, `asc_MoveToFillingForm`,
`asc_addRole`/`asc_getAllRoles`, `asc_getSectionId`, table/list/section mutations through
`apply_structure_op`/`apply_op` with typed op enums — that is the WO-native answer to OO's
`object-op` + `engine-mutation` surface (82 + 298 rows), and it keeps the CRDT model.

**R5 — view/session plumbing:** `asc_setViewerTargetType` (scroll-to-page), zoom get/set
(`asc_getZoom`, `asc_setZoomScale`), scroll lock — small exports, but every controller imports
them (Statusbar/Toolbar/ViewTab).

**R6 — defer the shared-bundle leakage.** The ~301 `other` rows (spreadsheet engine, PDF annots,
plugin bridge internals) have **zero word-UI callers**; do not port them as word exports. They
belong to the sheet/pdf editor port contracts. Plugin surface (`asc_pluginRun`, `asc_pluginsRegister`,
...) should be one dedicated `plugins` module, not 20 exports.

**R7 — keep the render/input split as a declared divergence.** OO's engine renders internally and
eats raw input; WO's `render_page`/`handle_*`/`layout_*` exports are the better contract for wasm.
Document this in PORT-PLAN (ORM-10) rather than emulating OO's invisible call graph.

## 7. Machine-readable artifact

`plan/oo-port/wasm-api.json` — array of 970 objects, sorted by `group` asc, then `ui_caller_count`
desc, then `name`:

```jsonc
{
  "name": "asc_setRestriction",       // the OO asc_* surface name (970 unique)
  "group": "protection",              // 28 semantic groups (§3)
  "side": "engine-mutation",          // engine-query | engine-mutation | discovery | data-class-ctor | object-op
  "ui_caller_count": 11,              // word-UI call sites in documenteditor controllers
  "ui_caller_files": ["DocProtection", "FormsTab", "Main"],
  "sdk_ref_count": 1,                 // references inside sdkjs/word/sdk-all.js
  "wo_export_name": "",               // filled only when an existing export covers the row
  "wo_missing": true,                 // true = must be added/aliased in wo-renderer-wasm
  "member_of": ["..."],               // defining class(es) when a data-class member accessor
  "note": "..."                       // coverage rationale / event-callback / struct-member remarks
}
```

Consumers: ORM-02 (event half), ORM-03 (the 79 `data-class-ctor` rows + 510 `member_of` rows),
ORM-04 (engine internals behind the query surface), ORM-10 (aggregate PORT-PLAN.md).

## 8. Re-baseline addendum (P1-04, Phase-1)

Everything above is the original ORM-01 measurement; the sections' verdicts are
preserved as history. The ledger of record (`wasm-api.json`) has since been
re-baselined: every row now carries a `resolution` classification
(`landed-export|landed-blob|landed-push-frame|push-frame-other|planned-op|planned-blob|planned-export|divergence|deferred-leakage|compat-optional`)
plus `resolution_target`, and the **74 UI-caller rows** carry a verified
`call_kind` (api-call / event-register / payload-accessor / payload-ctor).
Headline correction the re-baseline adds: of those 74 rows, only 12 are true
`api.asc_*` engine calls — the other ~62 are engine→UI event registrations or
payload-object accessors (ORM-02/ORM-03 domain). `wo_missing=false` stands for
30 rows; §2's "967 of 970 missing" reads against the pre-Phase-1 baseline.
See **`P1-MAPPING-rust.md`** (method, full classification, deferred-leakage
census, divergences) and the idempotent regenerator
`p104-rebaseline.cjs`.
