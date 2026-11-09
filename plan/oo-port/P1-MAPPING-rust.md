# P1-MAPPING-rust — wasm-api.json re-baseline: resolutions for all 970 `asc_*` rows

ORM-01 follow-up (Phase-1 exit criterion, PORT-PLAN target 1): *"every ORM-01 row
with a word-UI caller is served either by an export, a property blob, a typed op,
or a push frame — or is a named divergence."* This task re-baselines
`plan/oo-port/wasm-api.json` from a two-state ledger (`wo_export_name` empty or
set) to a per-row **resolution** classification, and hand-classifies the **74
rows with word-UI callers**. Ledger-only change: no Rust or JS code is touched.

Artifact: `wasm-api.json` (970 rows) gains `resolution`, `resolution_target`,
and — on UI-caller rows — `call_kind` + `note`; `deferred-leakage` rows carry
`leak_family`. Regenerator: `plan/oo-port/p104-rebaseline.cjs` (idempotent,
in-place, asserts 74/74 classification coverage on every run).

## 0. Verdict

Every one of the 970 rows now carries a resolution. The Phase-1 picture:

| resolution | rows | meaning |
|---|---|---|
| `landed-export` | 27 | a `#[wasm_bindgen]` export serves the row today |
| `landed-blob` | 3 | served through the landed `props.rs` blob kinds (`color`/`paragraph`/`border`) |
| `landed-push-frame` | 12 | a named `WsEvent` variant is landed for the callback (P1-01); producer wiring pending unless noted |
| `push-frame-other` | 101 | engine→UI callback tail riding `WsEvent::Other{name}` 1:1 |
| `planned-op` | 11 | typed op over `apply_structure_op`/`apply_op` (D3), phase named in the note |
| `planned-blob` | 78 | property payload (D2) — struct planned, or struct landed without its blob kind |
| `planned-export` | 1 | `asc_registerCallback` → `register_callback`/`unregister_callback` (D1) |
| `divergence` | 2 | named divergence (D5), no counterpart planned |
| `deferred-leakage` | 298 | shared-bundle leakage — spreadsheet/pdf/plugin/presentation plumbing, names recorded |
| `compat-optional` | 437 | in-surface, **zero word-UI callers** — no Phase-1 contract; serve via alias/op when a consumer appears (D4) |

`wo_missing=false` now stands for **30 rows** (27 prior + 3 blob flips below).
Frame coverage intentionally does **not** flip `wo_missing`: per the P1-01
ledger precedent it is recorded in ORM-02 (`wasm-events.json`, 19 rows with
`existing: WsEvent::<Variant> push frame`), so ORM-01 keeps
`wo_missing` = "no landed export/blob-shaped counterpart". The re-baseline adds
the resolution layer on top; it does not rewrite the coverage semantics.

New ledger flips this pass (verified landed in `core/crates/wo-renderer-wasm/src/props.rs`,
`set_property`/`get_property` kinds `run|paragraph|border|color`):

| row | `wo_export_name` |
|---|---|
| `asc_CColor` | `set_property/get_property("color") ↔ props::WasmColor` |
| `asc_CParagraphProperty` | `set_property/get_property("paragraph") ↔ props::WasmParagraphProperty` |
| `asc_CTextBorder` | `set_property/get_property("border") ↔ props::WasmTextBorders` |

This mirrors the existing `asc_CUserInfo` blob row (`setUserInfo/getUserInfo`).

## 1. Method (all commands re-runnable)

1. **Landed exports** — re-grepped from the crate at baseline time:

   ```sh
   grep -A3 '#\[wasm_bindgen' core/crates/wo-renderer-wasm/src/{lib,session,events,props}.rs \
     | grep -E 'pub fn|js_name'      # 35 lib + 26 session + 3 events + 2 props
   grep -nE '"(run|paragraph|border|color|paddings|shape|image)"' \
     core/crates/wo-renderer-wasm/src/props.rs   # blob kinds actually wired
   ```

   Only `run`, `paragraph`, `border`, `color` are `set_property`/`get_property`
   kinds today; `paddings`/`shape`/`image` structs parse inside the op path only
   — hence `asc_CImgProperty`/`asc_CRect`/`asc_CParagraphFrame` stay
   `planned-blob` although their structs are landed.

2. **UI-caller call-site scan** — the original ORM-01 `ui_caller_count` counted
   word-boundary name hits in the 18 word controllers; this pass resolves *how*
   each call reaches the name (receiver + right context, 30-char window):

   ```sh
   cd /tmp/oo-src/documenteditor/main/app/controller && node -e '
     const files=["DocProtection","DocumentHolder","DocumentHolderExt","FormsTab",
       "HeaderFooterTab","LeftMenu","Links","Main","Navigation","PageLayout",
       "PageThumbnails","Print","RightMenu","Search","Statusbar","Toolbar",
       "ViewTab","Viewport"].map(f=>f+".js");
     for (const f of files) { const s=require("fs").readFileSync(f,"utf8");
       /* for each UI-caller name: collect slice(idx-30,idx)+"|"+slice(idx+len,idx+len+2) */ }'
   ```

   Receiver shapes separate three worlds that the raw count blurred:
   - `api-call`: `this.api.asc_X(...)` — a true engine boundary call;
   - `event-register`: `api.asc_registerCallback('asc_X', ...)` — an engine→UI
     callback (ORM-02 domain), **not** a JS→engine method;
   - `payload-accessor` / `payload-ctor`: `obj.asc_X()` on an `asc_C*`/`OForm`
     instance or `new Asc.asc_C*(...)` — crosses the boundary **inside the
     ORM-03 payload**, not as a standalone engine call.

   Cross-checks against the defining-class data already in the ledger
   (`member_of`) and the bundle (`grep -oE "X.prototype.asc_Y = function"`
   `sdk-all.js`), e.g. `asc_getSectionId` is defined on
   `CSmartArtPreviewInfo` (sdk-all.js:199495) and the Toolbar caller reads a
   preview payload — so the row is a payload accessor, not an api method.

3. **Frame names** — the landed `WsEvent` variant list from
   `wo-renderer-wasm/src/events.rs` matched against surface names (shared-api
   event names such as `asc_onBold`/`asc_onZoomChanged` are **not** in the 970
   word-bundle surface — consistent with wasm-api.md §2's absences and with
   ORM-02 carrying them in its 386-row ledger).

4. **Leakage net** — name-pattern families (spreadsheet engine
   `AutoFilter|DefName|Solver|Calc|Xfs|Pane|SortList|PrintTitles|…`, pdf
   `Annot|Pdf|Redact`, plugin `plugin`, presentation `Slide|Notes|Demonstration`)
   plus the group-`other` residue, which ORM-01 §2 already read as the bundled
   spreadsheet/pdf/plugin slice.

## 2. The 74 UI-caller rows — the re-baseline's headline finding

By call kind: **12 api-calls, 25 event registrations, 36 payload
accessors/ctors, 1 constructor divergence**. The ORM-01 headline ("74 UI-driven
engine calls") therefore over-counts the JS→engine contract roughly 6×: only
the 12 api-calls (plus the 190-site `asc_registerCallback` registration
mechanism) are calls *into* the engine; the other ~60 rows are the engine
talking *out* (event registrations) or the UI poking *payload objects* it
already holds (ORM-03 domain). The Phase-1 channel decisions (D1–D3) absorb
them all — nothing new is needed.

### 2.1 api-calls (12)

| row | callers | resolution → target | note |
|---|---|---|---|
| `asc_registerCallback` | 190 (all 18 controllers) | planned-export → `register_callback`/`unregister_callback` | hottest row of the surface; sink half (`set_event_sink` + `WsEvent` push) landed P1-01; the UI-facing registration export is the remaining Phase-1 half (D1) |
| `asc_enableKeyEvents` | 14 | **divergence** → `handle_key_event`/`handle_mouse_event` | D5 input split: OO focus-gates raw keys before the api; WO consumes raw input unconditionally |
| `asc_setRestriction` | 11 | planned-op → `apply_structure_op(op:"set_restriction")` | DocProtection/FormsTab/Main; Phase 3 with forms |
| `asc_setViewerTargetType` | 6 | planned-op → `set_viewer_target_type` | viewer select/fill target switch; bundle-internal twin at sdk-all.js:509144 |
| `asc_coAuthoringDisconnect` | 5 | **landed-export** → `coAuthoringDisconnect` | pushes `WsEvent::CoAuthoringDisconnect` via `events::push` |
| `asc_addImage` | 5 | planned-op → `add_image` | D3 names this row; blocked on Phase-2 images (ORM-04 sev3) |
| `asc_MoveToFillingForm` | 4 | planned-op → `move_to_filling_form` | D3 names this row; Phase 3 forms |
| `asc_AddMath` | 3 | planned-op → `add_math` | OMML, Phase 4 tail |
| `asc_Save` | 1 | **landed-export** → `serialize_document` | D4 adds the `asc_Save` upload wrapper alias (planned) |
| `asc_insertSymbol` | 1 | planned-op → `insert_symbol` | Toolbar symbol dialog |
| `asc_isSupportFeature` | 1 | **landed-export** → `asc_isSupportFeature` | landed P1-03 |
| `asc_docs_api` | 1 | **divergence** → `init`/`create_document` | Viewport's `new Asc.asc_docs_api` ↔ WO explicit init/create_document split (D5, keep) |

Landed today: 3 of 12 (+ the registration mechanism planned). Everything else
is a small typed op — no new export families.

### 2.2 event registrations (25)

Landed named frames (8): `asc_onError`→`error`, `asc_onCurrentPage`→
`current_page`, `asc_onDocumentContentReady`, `asc_onContextMenu`→
`context_menu`, `asc_onShowContentControlsActions`/`asc_onHideContentControlsActions`
→ `focus_object` (kind `control`; CC action-toolbar show/hide is exactly the
toolbar-context switch D1 named), `asc_onAddComment`→`add_comment`,
`asc_onPrAlign`→`toolbar_state{align}`.

`WsEvent::Other{name}` tail (17): the smartart previews, math-track show/hide,
`asc_ChangeCropState`, `asc_updateListPatterns` (an event, not a method —
verified `asc_registerCallback('asc_updateListPatterns', …)` in Toolbar),
`asc_onHyperlinkClick`, `asc_onMarkerFormatChanged`, `asc_onParaSpacingLine`,
`asc_onRulerDblClick`, `asc_onTextDirection`, `asc_onSingleChartSelectionChanged`,
`asc_onOFormChangeFinal`, `asc_onUpdateOFormRoles`, `asc_onConfirmAction`,
`asc_onDisconnectEveryone`. Four of them are explicit `toolbar_state` /
`focus_object` extension candidates for Phase 2/3 (noted on their rows).

### 2.3 payload accessors & ctors (36)

Landed blob rows (3): `asc_CColor`, `asc_CParagraphProperty`, `asc_CTextBorder`
(flipped this pass, §0). Landed exports (3): `asc_CUserInfo`,
`asc_getUserName`, `asc_getUserId` — with the honest note that their UI call
sites are *comment/user payload accessors*; the landed session exports serve
the api-name rows. Landed frames (2): `asc_getObjectType`/`asc_getObjectValue`
— the selection-element poll (`selectedObjects[i].asc_getObjectType()`) that
D1's `focus_object`/`selection_changed` frames replace.

Planned blobs (25): image/rect/paragraph-frame ctors (structs landed in
`props.rs`, blob kinds pending), chart payloads (`wo_chart::Series`, ORM-03
partial), forms role payloads, protection props (`props::WasmProtection`
planned), special-paste options, comment `resolved` flag. Planned ops (4):
`asc_getAllRoles`, `asc_addRole`, `asc_canFillRole` (D3 names the first two),
`asc_setEditType`/`asc_setPassword` — UI receivers are the protection payload,
but PORT-PLAN D3 routes that family through typed ops (3 rows count here:
getEditType/getIsPassword stay blobs).

Duck-typed rows worth recording: `asc_getValue`, `asc_getSize`, `asc_putSize`
are called on border objects in Toolbar (`border.asc_getValue && …`) while
their defining classes are spreadsheet-slice (`CCellWatch`,
`CCustomProperty`) / numbering (`CBullet`) — classified `planned-blob` with
that note, not landed, because the row's own class is not the border payload.

## 3. deferred-leakage — the ~300-row shared-bundle residue, names recorded

PORT-PLAN Phase-1 item 5 requires deferring the shared-bundle leakage rows
"with names recorded". The re-baseline marks **298 rows** `deferred-leakage`,
each with `leak_family`:

| family | rows | what it is | where it goes |
|---|---|---|---|
| `shared-bundle` | 214 | group-`other` residue: formula/sort/annotate plumbing (`asc_getArguments*`, `asc_CloseSolver`, `asc_CDefName`, …) | stays in the bundle; revisit only if a consumer appears |
| `spreadsheet` | 69 | `AscCommonExcel` engine verbs (`asc_getAutoFilterInfo`, `asc_CSolverParams`, `asc_setPrintTitlesHeight`, …) | ORM-06's `wo-sheet` domain, not the word wasm contract |
| `presentation` | 5 | pptx slices (`asc_getSlides`, `asc_getNotes`, `asc_onStartDemonstration`, `asc_putLayout`) | ORM-07 domain |
| `pdf` | 6 | annotation props (`asc_CAnnotProperty`, `asc_CFreeTextAnnotProperty`, …), redact | out of the word contract |
| `plugin` | 4 | `asc_pluginRun`, `asc_pluginsRegister`, `asc_pluginResize`, `asc_pluginAddGuid` | Phase-3 dedicated plugin module (named in PORT-PLAN item 5) |

Reconciliation with ORM-01 §2's "~301": the estimate equated the whole
group-`other` (301 rows) with leakage. The re-baseline moves 13 group-`other`
rows out of that bucket because they are UI-caller rows (payload accessors like
`asc_getObjectType` or the `asc_registerCallback` mechanism itself), and moves
~10 rows *into* leakage from other groups via the name net (PrintTitles,
Slides/Notes, Redact) — landing at 298 with an auditable family split.

## 4. divergence — the named non-ports (D5)

Only two UI-caller rows are true divergences, both already part of the plan's
declared split:

1. `asc_enableKeyEvents` — OO's focus-gated key routing has no WO counterpart;
   WO's `handle_key_event`/`handle_mouse_event` consume raw input by design.
2. `asc_docs_api` — the OO api constructor + host wiring maps onto WO's
   explicit `init` + `create_document` split; the invisible OO call graph is
   not emulated (wasm-api.md §4 rows 1/3).

Everything else that OO reaches and WO serves differently (rendering cadence,
`render_page`, layout-on-edit) is already recorded in wasm-api.md §4 and
ORM-04; this ledger adds no new divergence kinds.

## 5. The 896 non-UI rows — default policy

Rows with zero word-UI callers carry no Phase-1 contract (PORT-PLAN target 1
binds only UI-caller rows), so the re-baseline keeps them boring:

- `discovery` rows: named landed frame where `events.rs` has a variant
  (e.g. `asc_onSelectionEnd`→`selection_end`, `asc_onUpdateScrolls`→
  `update_scrolls`), else `push-frame-other` (`WsEvent::Other{name}`);
- `data-class-ctor` rows: `planned-blob`, target taken from ORM-03's
  `wo_struct_name` when a struct exists ("wire pending"), else a planned
  `props::Wasm*` name; leakage families keep their leakage label;
- everything else non-leaking: `compat-optional` — the D2/D3 family coverage
  (blobs/ops) serves them on demand; D4 aliases are added per hot row, never
  as a 970-export dump.

## 6. Ledger rules going forward

- As exports/ops/blob kinds/frame producers land, flip the row to the matching
  `landed-*` resolution and set `wo_export_name`/`wo_missing=false` — same rule
  as the P1-01 ledger commit; update `p104-rebaseline.cjs` tables, not the
  JSON by hand, so the pass stays re-runnable and idempotent.
- `wo_missing` keeps its export/blob-shaped meaning; push-frame coverage stays
  in `wasm-events.json` (ORM-02 is the event ledger of record).
- `compat-optional` rows graduate to a planned/landed resolution only when a
  consumer appears (editor.js dialog work, ORM-09) — that is the trigger to
  file a Phase-2/3 row, not to pre-build exports.

## 7. Verification performed

- Regenerator asserts 970 rows, 74/74 UI-caller classification, and is
  byte-idempotent on re-run.
- Every landed resolution target was grepped out of
  `core/crates/wo-renderer-wasm/src/{lib,session,events,props}.rs` at
  baseline time (§1 step 1); the three blob flips correspond to wired
  `set_property`/`get_property` kinds.
- Every UI-caller `call_kind` cites a verified receiver shape (§1 step 2);
  ambiguous rows cite the defining-class evidence (`member_of` / bundle
  prototype scan) in their notes.
- Tally sums to 970; `covered` (`wo_missing=false`) = 30.
