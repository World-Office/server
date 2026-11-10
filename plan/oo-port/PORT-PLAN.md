# ORM-10 — OO→WO Port Plan (consolidated PORT-PLAN)

This document consolidates the nine oo-rust-map coverage maps (ORM-01 … ORM-09,
see `INDEX.md`) into a single port plan and records the **architecture
decision** the campaign was chartered to make: does World-Office (WO) reach
OnlyOffice (OO) parity by porting OO's API shape 1:1, or by keeping WO's own
boundary and serving OO's surface as a compatibility layer on top of it?

Consolidated artifacts (all under `plan/oo-port/`, numbers quoted from the
verified maps — nothing here re-measures the sources):

| task | report | machine-readable data | what it measures |
|---|---|---|---|
| ORM-01 | `wasm-api.md` | `wasm-api.json` (970 rows) | OO word SDK `asc_*` call surface vs the 35 WO wasm exports |
| ORM-02 | `wasm-events.md` | `wasm-events.json` (386 rows) | engine→UI events vs WO's push channel |
| ORM-03 | `wasm-data-classes.md` | `wasm-data-classes.json` (87 rows) | `asc_C*` payload classes vs Rust serde types |
| ORM-04 | `engine-internals.md` | `engine-internals.json` (167 areas) | DesktopEditor C++ vs WO renderer crates |
| ORM-05 | `ooxml-docx.md` | `ooxml-docx.json` (193 rows) | DocxFormat C++ vs `wo-ooxml`/`wo-x2t` word path |
| ORM-06 | `ooxml-xlsx.md` | `ooxml-xlsx.json` (118 rows) | XlsxFormat C++ vs `wo-sheet` |
| ORM-07 | `ooxml-pptx.md` | `ooxml-pptx.json` (134 rows) | PPTXFormat C++ vs `wo-slide`/`wo-x2t` |
| ORM-08 | `legacy-binary.md` | `legacy-binary.json` (53 rows) | MsBinaryFile vs `wo-msbinary`/`wo-x2t` |
| ORM-09 | `ui-webapp.md` | `ui-webapp.json` (217 rows) | web-apps controllers/views vs `editor.js` |

## Decision

**WO does not port OO's API shape 1:1. WO keeps its own wasm boundary —
push events, typed property blobs, typed structural ops — and treats OO's
`asc_*` surface as a compatibility target served by that boundary, not as
the boundary itself.**

Rationale in one line: OO's boundary is query-heavy (401 of 970 `asc_*` rows
are `engine-query` getters) because OO keeps editing state *in* the JS engine
and the UI polls it on every selection change; a wasm port inverts this —
state lives in Rust — so most query rows collapse into a small number of
pushed state frames plus a few getters. Porting 970 named exports would
recreate the poll storm inside wasm with none of the benefits.

Sub-decisions (each traceable to a source map):

- **D1 — Event channel: push, not polls** (ORM-01 R0 + ORM-02). One
  `WsEvent` enum + a `set_event_sink` export replaces the 101 `asc_on*`
  discovery rows and the 401 poll-prone query rows. The UI registers through
  `register_callback`/`unregister_callback` (covering the hottest row of the
  whole surface, `asc_registerCallback`, 190 call sites across all 18 word
  controllers); unknown events survive 1:1 as `WsEvent::Other { name }`.
- **D2 — Formatting via property blobs, not 400+ getter/setter exports**
  (ORM-01 R3 + ORM-03). One `set_property(kind, json)` / `get_property(kind)`
  pair over ~25 serde structs in a `wo-renderer-wasm::props` module covers
  the `asc_C*` family (`asc_CParagraphProperty`, `asc_CColor`,
  `asc_CTextBorder`, `asc_CPaddings`, `asc_CShapeProperty`, …). Serde JSON
  with camelCase keys reproduces the `asc_getX`/`asc_putX` wire schema the OO
  UI is written against — no translation layer.
- **D3 — Mutations via the typed op model** (ORM-01 R4). Structural changes
  (`asc_addImage`, `asc_AddMath`, `asc_setRestriction`, `asc_setEditType`,
  `asc_setPassword`, `asc_MoveToFillingForm`, `asc_addRole`/`asc_getAllRoles`,
  `asc_getSectionId`, table/list/section edits) route through the existing
  `apply_structure_op`/`apply_op` exports with typed op enums — this is what
  keeps the CRDT model instead of importing OO's single-writer JS state.
- **D4 — OO naming via `#[wasm_bindgen(js_name)]` aliases only** (ORM-01 R1).
  Rust stays snake_case. Aliases are added for rows the boundary already
  covers (`insert_text` → `asc_enterText`, `spell_check_word` →
  `asc_IsSpellCheckCurrentWord`, an `asc_Save` wrapper that also produces the
  upload payload, `asc_undoAllChanges` over `undo`) and for future hot rows —
  never as 970 new exports.
- **D5 — Rendering/input split is a declared divergence** (ORM-01 R7 +
  ORM-04 §6). OO's engine renders internally and eats raw input; WO keeps
  `render_page`/`layout_document`/`render_laid_out_page`/`handle_*` as
  explicit exports. This is deliberate; the OO invisible call graph is not
  emulated.
- **D6 — Converters stay package-level with verbatim preservation, closed by
  typed engines where fidelity demands it** (ORM-05/06/07/08). The
  "verbatim escape hatch" tier (`raw_ppr`, `raw_rpr`, `raw_sect_pr`,
  `PptxExtraPart`, `extra_parts`) is the fidelity strategy for untouched
  parts; the three named typed engines (fields, style resolution, numbering)
  plus per-app module additions close the rows where byte preservation is
  not enough. Legacy binary stays read-only with a never-build-writers
  policy; a future `.doc` read lands as doc→docx in-memory package assembly
  on the spec-complete CFB substrate (`wo-msbinary::ole`), not as a parallel
  renderer.

Rejected alternatives, for the record:

1. *Port all 970 `asc_*` exports as `#[wasm_bindgen]` fns.* Rejected: 896 of
   970 rows have zero word-UI callers; ~301 are shared-bundle leakage
   (spreadsheet/PDF/plugin plumbing that is not part of the word contract at
   all); the export count would grow with no UI value and freeze WO to OO's
   accidental naming.
2. *Make editor.js speak raw `asc_*` directly (no WsEvent layer).* Rejected:
   it reintroduces per-selection polling across the wasm boundary and makes
   the 191-name `asc_registerCallback` registry a wasm contract; the ORM-02
   dispatcher idiom (`notifyHost`, `wo-event` fan-out) already exists and is
   cheaper.
3. *Replace verbatim-preservation converters with a full typed OOXML model
   first.* Rejected by the maps: ORM-05 shows 115 missing DocxFormat classes
   but also that round-trip fidelity today comes from the verbatim tier; the
   typed engines are ranked additions, not a rewrite gate.

## Current-vs-target

Consolidated scoreboard over the nine maps (coverage as measured by each
task; different row units — method, event, class, area, family, component —
so columns are per-row-of-that-map, not cross-comparable):

| map | OO side measured | WO today | gap verdict |
|---|---|---|---|
| ORM-01 wasm-api | 970 unique `asc_*` methods (74 with word-UI callers; 510 data-class accessors; 101 `asc_on*`) | 35 wasm exports, 3 cover a row (`asc_enterText`, `asc_IsSpellCheckCurrentWord`, `asc_Save`) | 967 rows uncovered; boundary is a *renderer* boundary, not an *editing-engine* boundary |
| ORM-02 wasm-events | 386 events (181 `asc_on*` + 112 shared-api + 93 legacy); UI registers 191 names at 459 sites | no event enum in `wo-renderer-wasm`; events reach JS only as DOM/pull | whole push channel missing; 15 frames ≈ 85% of UI value |
| ORM-03 wasm-data-classes | 87 `asc_C*` classes, 16 families (spreadsheet 19, form-field 14, shape-graphics 13, …) | no `props` module; serde types absent | ~25 structs to add; `asc_CTextBorder` (47 UI uses) is the highest-frequency payload |
| ORM-04 engine-internals | 167 DesktopEditor areas (3,227 classes / 38,208 fns) | sev0 36 / sev1 40 / sev2 72 / **sev3 19** | 19 severity-3 rows = 6 engine capabilities (images, shaping, text layout, rasterizer, metafile decode, boolean ops/JS host) |
| ORM-05 ooxml-docx | 193 load-bearing DocxFormat classes | 28 full / 50 partial / 115 missing | direct-formatting converter + verbatim tier; fields/styles/numbering engines missing |
| ORM-06 ooxml-xlsx | 118 XlsxFormat families (829 classes / 5,340 fns) | 2 full / 42 partial / 74 missing | 9 core parts regenerated; charts/pivot/tables/comments ride `extra_parts` passthrough |
| ORM-07 ooxml-pptx | 134 concepts (447 classes / 3,379 fns) | 26 full / 39 partial / 69 missing | inheritance/theme/group shapes/text-body/tables/transitions unmodeled; `PptxExtraPart` preserves bytes |
| ORM-08 legacy-binary | MsBinaryFile (2,954 files; DocFile alone 287 files / 330 classes) | 5 full / 9 partial / 1 stub / 38 missing | **`.doc` is unreadable today**; CFB container is spec-complete and kept |
| ORM-09 ui-webapp | 217 web-apps components (~237 files) | 60 full / 91 partial / 17 hosted / 20 merged-into-editor.js / 29 blocked / 0 missing (P3-U05 closure) | data-driven dialog engine landed (P3-U01..U04, 19 specs); ledger closed to 0 `missing` — forms/signing/thumbnails/`External*` blocked on named prerequisites (ORM-01 roles exports, ORM-05 sdt engine, ORM-04 sev-3 rasterizer, Phase-4 plugin/iframe runtime) |

Target end-state (what "done" means for this plan):

1. The wasm boundary exposes the boundary-channel exports (D1–D3) so every
   ORM-01 row with a word-UI caller is served either by an export, a
   property blob, a typed op, or a push frame — or is a *named* divergence.
2. ORM-04's six severity-3 capabilities are closed (sev3 count = 0).
3. ORM-05/06/07 typed engines and module additions land; verbatim tiers stay
   as the safety net, with round-trip tests pinning them.
4. editor.js hosts the ORM-09 dialog backlog from the data-driven dialog
   engine; the blocked families (forms, thumbnails/print) unblock as their
   engine/format prerequisites land.
5. Legacy binary remains read-only, loud about unsupported members (F-402),
   with metadata filled from `SummaryInformation`.

## Phase 1

**Phase 1 — Boundary channel: events, property blobs, session. No UI work;
unblocks every controller port.**

1. **Event channel (D1).** `register_callback`/`unregister_callback` exports;
   the `WsEvent` enum with snake_case variants (`asc_onDocumentModifiedChanged`
   → `document_modified_changed`); `set_event_sink` export; the editor.js
   dispatcher consuming frames exactly like its existing `ctx-menu`/
   `wo-command` plumbing, unknown frames fanning out as `wo-event`
   CustomEvents. First 15 frames (≈ 85% of UI value per ORM-02):
   `selection_end`, `toolbar_state`, `focus_object`,
   `document_modified_changed`, `document_content_ready`, `can_undo_redo`,
   `zoom_changed` (+ legacy `zoom_change`), `current_page`, `error`,
   `long_action`, `context_menu`, `co_authoring_disconnect`,
   `auth_participants_changed`, `lock_document_props`, `download_url`.
   Keep both zoom variants distinct so old consumers still match.
2. **Property-blob module (D2).** `wo-renderer-wasm::props` with the ~25
   `Wasm*` serde structs from ORM-03 §6, reusing `wo-ooxml` model types where
   field sets already match (`WasmBorder` ← `asc_CTextBorder` composes into
   `WasmTextBorders` and deserializes into `DocxBorder`). Then
   `set_property(kind, json)` / `get_property(kind)` and map
   `apply_formatting`/`get_run_formatting` onto them — this is the WO name
   for the whole run-format + paragraph + table property family (50+16+39
   ORM-01 rows).
3. **Session & lifecycle exports** (ORM-01 R2): doc id/token/server-version/
   url-changes setters, document-info getters, `asc_coAuthoringDisconnect`
   equivalent, `asc_getUserName`/`asc_getUserId` identity, `asc_isSupportFeature`.
4. **js_name aliases (D4)** for existing coverage: `insert_text` →
   `asc_enterText`, `spell_check_word` → `asc_IsSpellCheckCurrentWord`,
   `asc_Save` upload wrapper over `serialize_document`, `asc_undoAllChanges`
   over `undo`.
5. **Defer, with names recorded**: the ~301 shared-bundle leakage rows
   (spreadsheet engine, PDF annotations, plugin plumbing) and the plugin
   surface (`asc_pluginRun`, `asc_pluginsRegister`, …) — plugins become one
   dedicated module in Phase 3, not 20 exports.

Exit criteria: an `editor.js` page can register callbacks, receive the 15
frames, set/get paragraph/run/border/color property blobs, open a document
with session fields, and undo/redo — with ORM-01's 74 UI-caller rows each
mapped or named as divergence; `wasm-api.json` rows updated with
`wo_export_name` as they land.

## Phase 2

**Phase 2 — Engine and converter parity. Close ORM-04's six critical
capabilities and ORM-05/06/07's named engines/modules.**

1. **Images (ORM-04 Phase A, already tagged DM-7 — smallest diff, largest
   visual payoff).** `Canvas::draw_image` in wo-renderer; stop skipping
   `DocxBlock::Image` in `wo-renderer-wasm/src/layout.rs` (currently a
   literal no-op); image-bytes/handle export; `ImageData` blit path in
   `canvas_bridge.rs`.
2. **Shaping + text layout (Phase B).** Extract a `Shaper` from
   `canvas.rs::draw_text` (rustybuzz + swash are already dependencies),
   add `wo-renderer::shaping` and `textlayout` modules, replace
   `char_advance` line breaking with shaped-run breaking; bidi segmentation
   consumes the existing wo-unicode tables. No wasm signature changes.
3. **Rasterization quality (Phase C).** Agg-grade rasterizer behind the
   unchanged `Canvas` API (stroke joins/dashes, AA cells, clip stack).
4. **DOCX typed engines (ORM-05, ranked):** fields engine, style-chain
   resolution (docDefaults/pStyle/latentStyles), numbering engine beyond the
   fixed 8-abstractNum template; plus the generic unmanaged-parts bag
   (diagrams, customXml re-zip intact) and two more verbatim captures
   (`w:pict`, `endnotes.xml`, `settings.xml`); bookmarks/`w:hyperlink
   w:anchor` survival; sdt metadata round trip. Pin each with the gap tests
   the map names (`gap_numbering_foreign_roundtrip`,
   `gap_bookmark_anchor_roundtrip`, `gap_pict_verbatim_roundtrip`, …).
5. **XLSX module additions (ORM-06):** `wo-sheet::chart_bridge` (parse
   `xl/charts/*` into `wo-chart` models), `table` (ExcelTable + structured
   references), `hyperlink`, `pivot_file` (serde structs feeding the existing
   `PivotEngine`), `rich_text` (replacing `raw: String` flattening), `page`
   (pageSetup/print), `cf_styles` (color scale/data bar/icon set + dxf),
   `external`; extend `serialize_xlsx` beyond the 9 core parts.
6. **PPTX additions (ORM-07):** `inheritance.rs` (slide→layout→master
   background chain, placeholder `idx`), `GroupShape` + parser recursion,
   `theme.rs` (FmtScheme/ClrMap/SchemeClr resolution), `SlideTextBody` with
   BodyPr + bullets, table cell borders + tableStyles reader, `ChartRef` at
   parse, transition params. Decide `wo-drawing` crate vs `wo-slide::drawing`
   module per the map's guidance (do not fold into `wo-slide::geometry`).

Exit criteria: sev3 count in `engine-internals.json` = 0; the named ORM-05
gap tests pass; xlsx round trips keep charts/tables/hyperlinks without
`extra_parts`; pptx renders inherited backgrounds and group shapes.

## Phase 3

**Phase 3 — UI surface: editor.js hosts the OO dialog/view backlog.**

1. **Data-driven dialog engine** (ORM-09): OO view definitions become data
   consumed by a generic panel builder in editor.js — hand-entered HTML for
   ~10k lines of missing OO view code is explicitly rejected. Preserve the
   two extension points: `data-wo-cmd` dispatch and `data-i18n`/
   `seedUiStrings()` so localization and the command ledger
   (`recordCommand`/`replayCommands`) come free. Backbone is not needed.
2. **Port the three prerequisite widgets first:** `TableStyler` (border
   painting), `HSBColorPicker` (custom colors), `MultiSliderGradient`
   (gradient stops).
3. **Dialog order (ORM-09, wasm-contract-first):** `TableSettingsAdvanced`
   (fields map onto existing exports + `asc_putBorderStyle`/
   `asc_putBorderWidth`), `ImageSettingsAdvanced` (crop/adjust are pure
   engine calls; the `rp-section image` rail is the mount point),
   `ShapeSettings` (needs `asc_CShapeFill`/gradient payloads + widget),
   `ReviewPopover` (pure UI on the existing comment list), then the
   blocked families: forms/signing (needs docxf format layer + roles
   exports) and `PageThumbnails`/Print preview (needs paginated raster
   output from Phase 2).
4. **Plugin module + long-tail events:** one dedicated plugins module
   (replacing ad-hoc `wo-command` bridging) and ORM-02's Phase-2/3 frames —
   comments, track-changes, proofing (`SpellCheckVariants` on the existing
   `spell_*` exports), then the table/chart/view long tail via
   `WsEvent::Other { name }`.

Exit criteria: the 61 `missing` ORM-09 rows are either hosted from the
dialog engine, merged-into-editor.js deliberately, or named as blocked with
their Phase-2 prerequisite; right-panel parity surface stays green.
**Ledger half met by the P3-U05 closure:** `ui-webapp.json` is at 0
`missing` — 17 `hosted` (engine specs named per row), 5
`merged-into-editor.js`, 29 `blocked` with their prerequisite named in
`notes`/`wo_anchor`; re-verified by
`apps/web/apps/documenteditor-wysiwyg/ui-closure.test.mjs` →
`UI-CLOSURE-PASS`. The open halves are the editor.js open/apply wiring for
the P3-U04 specs and the named prerequisites of the 29 `blocked` rows.

## Phase 4

**Phase 4 — Long tail, legacy formats, collaboration.**

1. **DOCX tail (ORM-05 missing list):** settings/endnotes/theme/fontTable/
   app.xml/flat OPC/people.xml/comments-ext/glossary/altChunk; OMML math and
   SmartArt/diagram rendering behind the Phase-2 parts bag; revisions
   (ins/del/move) as typed model + events.
2. **XLSX/PPTX tails:** pivot grouping + calculated items, slicers/
   timelines/RichData/external links; pptx animations beyond the existing
   module, smartart; both via the additive pattern the maps verified
   (`SheetOp`/serde contract stay stable).
3. **Legacy binary decision gate (ORM-08):** only on demand — `.doc`
   minimal text read (FIB + table-stream + piece table) landing as
   doc→docx in-memory assembly; `SummaryInformation`/`DocumentSummaryInformation`
   metadata fill; BIFF8 ptg → A1 reconstruction; escher container geometry
   for `.ppt`; FilePass decryption ("asks for password" instead of "fails
   loudly"). Policy stands: never build `.doc`/`.xls`/`.ppt` *writers*,
   chart/pivot binary readers, or animation binaries — the OOXML layer
   serves those.
4. **Collaboration & protection:** co-authoring identity/roles
   (`asc_CUserInfo`, `asc_CVersionHistory` serde types), content-control
   roles, document protection (`asc_setRestriction`, `asc_setEditType`,
   `asc_setPassword`, `asc_getIsPassword`), OOXML crypto on the kept CFB
   substrate. **Landed (P4-C01, wo-renderer-wasm):** `AscCUserInfo` /
   `AscCVersionHistoryEntry` camelCase serde plus the `WasmVersionHistory`
   blob (`setVersionHistory`/`getVersionHistory`), the protection pair
   `setDocumentRestriction`/`getDocumentRestriction` (JSON
   `{mode, allowPrint, allowCopy}`, modes
   `none|readOnly|comment-only|fill-forms|track-changes`, each set pushing
   `WsEvent::RestrictionChange`), and the `cc-role` store
   (`setCcRole`/`getCcRole`, `{id, role}` — props.rs carries no
   content-control kind yet, so the kind lives in lib.rs until the props
   module grows one). Still open: `asc_setPassword`/`asc_getIsPassword`,
   the OO numeric restriction-type alias, and OOXML crypto on CFB.

Exit criteria: the never-build list is still respected; every remaining
`wo_missing` row in the nine JSON maps resolves to *done*, *declared
divergence*, or *named blocked-on*.

## Risks

| # | risk | signal in the maps | mitigation |
|---|---|---|---|
| 1 | Poll-storm regression: naive asc_* shimming reintroduces per-selection query traffic across wasm | ORM-01: 401 engine-query rows exist precisely because OO polls | D1 push frames; getters only for what the 15 frames cannot carry |
| 2 | Verbatim escape hatches rot as typed engines grow (raw_* vs typed drift) | ORM-05: fidelity today is the verbatim tier | keep congruence/round-trip tests pinning raw_*; extend verbatim captures before deleting tiers |
| 3 | Severity-3 engine capabilities are bigger than estimated (6 capabilities, 19 rows) | ORM-04 histogram; `layout.rs` image no-op is the visible tip | Phase 2 ordered by payoff-per-diff (images first); each capability independently gated |
| 4 | `.doc` zero coverage surprises users/stakeholders | ORM-08: any "open a 2003-era .doc" story fails today | keep the loud F-402 unsupported-member reporting; Phase-4 gate with minimal text read |
| 5 | Scope creep from the 970-name surface | 896 rows have no word-UI caller; ~301 are bundle leakage | D4 aliases only; per-row `wo_missing` ledger; leakage explicitly deferred |
| 6 | Serde camelCase drift vs OO's getter/setter wire schema | ORM-03: getters/setters are the de-facto schema | field-level `properties` checklist in `wasm-data-classes.json` reviewed per struct |
| 7 | Rasterizer swap regresses canvas output | ORM-04 Phase C changes the filler under `Canvas` | API surface unchanged; canvas_bridge parity tests before/after |
| 8 | Dialog engine becomes a second framework | ORM-09: ~10k lines of OO view code tempt a port | data-driven builder; Backbone explicitly rejected; extension points preserved |
| 9 | XLSX additive plan silently downgrades on unmodeled parts (charts/pivot/comments) | ORM-06: 9 core parts regenerated, rest passthrough | serializer extensions in Phase 2; `extra_parts` stays as fallback, tagged F-200/206/207 |
| 10 | CRDT op model vs OO single-writer state incompatibilities | ORM-01 R4: object-op/engine-mutation rows | typed op enums reviewed against `apply_structure_op` semantics before aliasing |

## Verification

```sh
# headers present
for h in '## Decision' '## Current-vs-target' '## Phase 1' '## Phase 2' \
         '## Phase 3' '## Phase 4' '## Risks'; do grep -q "$h" plan/oo-port/PORT-PLAN.md || exit 1; done
# size and asc_* coverage of this plan
test "$(wc -l < plan/oo-port/PORT-PLAN.md)" -ge 250
test "$(grep -oE 'asc_[A-Za-z0-9_]+' plan/oo-port/PORT-PLAN.md | sort -u | wc -l)" -ge 20
# index lists every task
for i in ORM-01 ORM-02 ORM-03 ORM-04 ORM-05 ORM-06 ORM-07 ORM-08 ORM-09 ORM-10; do
  grep -q "$i" plan/oo-port/INDEX.md || exit 1
done
```

## Phase 5 — PageThumbnails backend (PTS)

1. **PTS-T1 (done):** docserver page-render API. `wo-docserver::render`
   serves `GET /api/documents/{id}/pages/{n}.png` (1-based `n`) as a real
   `image/png` response plus `GET /api/documents/{id}/pages/count`, backed
   by a new `DocxRenderPipeline::render_page_png` in `wo-docx-renderer`
   (layout → rasterize one page → PNG-encode the RGBA buffer, which the
   canvas only exposes raw). axum 0.8/matchit forbids dynamic route
   suffixes (`{n}.png`), so the page route is registered as
   `/pages/{page}` and the handler strips a trailing `.png`. Document
   resolution mirrors the editor read views (store first, `demo.docx`
   fallback); out-of-range pages are 404, bad ids/pages 400. This is the
   paginated raster output the ORM-09 ledger names as prerequisite for the
   blocked `PageThumbnails`/Print-preview families.
