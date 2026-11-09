# ORM-02 — OO SDK onMethod/on\* event callbacks → WO wasm event dispatch spec

Companion of `wasm-events.json` (386 curated events). This is the *second half* of the
OO⇄WO engine boundary documented in ORM-01 (`wasm-api.json`): ORM-01 covers the
JS→engine **calls** (`asc_*` exports), this file covers the engine→JS **events**
(the `on*` callbacks the SDK fires back at the UI) and specifies how a 1:1 Rust
wasm port must re-emit them so the current `editor.js` dispatcher can consume them.

---

## 1. Sources and extraction method (exactly what was run)

All source material is read-only on this host; nothing in the SDK or app sources
was modified.

**1. SDK bundles** — copied out of the running OnlyOffice rig container:

```sh
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/word/sdk-all.js /tmp/sdk-word.js   # 852,249 lines
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/cell/sdk-all.js /tmp/sdk-cell.js   # 958,820 lines
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/slide/sdk-all.js /tmp/sdk-slide.js # 825,390 lines
# note: sdkjs/pdf/sdk-all.js does not exist in this container image
```

**2. Fired-event names** — node regex over each bundle (word also scanned for the
legacy bare `on*` interface):

```sh
/usr/bin/node -e 'const s=require("fs").readFileSync("/tmp/sdk-word.js","utf8");
for (const m of s.matchAll(/asc_on[A-Za-z0-9_]+/g)) counts.set(m[0],(counts.get(m[0])||0)+1)'
# bare legacy handlers: /[^A-Za-z0-9_$.]on([A-Z][A-Za-z0-9_]{3,})[^A-Za-z0-9_]/g over /tmp/sdk-word.js
```

**3. UI register sites** — the web-apps UI registers api callbacks exclusively via
`asc_registerCallback('<name>', handler)` (verified: **no** `api.on(...)` and **no**
direct `api.asc_onX =` assignments exist in the sampled app). Counted across all
264 js files under `/tmp/oo-src` (documenteditor + common):

```sh
grep -rhoE "asc_registerCallback\(['\"]asc_on[A-Za-z0-9_]+" /tmp/oo-src --include='*.js' \
  | sed -E "s/asc_registerCallback\(['\"]//" | sort | uniq -c | sort -rn
# → 191 unique names, 459 register sites total
```

**4. WO-side ground truth** (this worktree, read-only):

- `core/crates/wo-renderer-wasm/src/lib.rs` (4,862 lines, 35 `#[wasm_bindgen]`
  exports) — **no event enum exists**; `grep on_ | grep event` over the crate
  returns nothing. All engine→JS information is currently *pull-based*
  (`get_selection_rects`, `get_cursor_position`, `get_selected_text`, …).
- `apps/web/apps/documenteditor-wysiwyg/editor.js` (14,516 lines) — DOM events
  (`click`, `keydown`, `input`, `selectionchange`, `resize`, `contextmenu`, …),
  host notifications via `notifyHost("editing"|"saved"|"closed"|"close")`
  (74 `editing` sites), and two custom events: `wo-command` (host→editor,
  inverse direction) and `ctx-menu`.

**Provenance caveat (honest finding):** 112 of the 191 UI-registered names are
*not* literal tokens in the three sampled bundles. They are fired from the shared
api base layer compiled into each editor bundle (and per-version service glue),
so their fire-site counts are unknown; they are included because the UI contract
(`asc_registerCallback`) is the thing a 1:1 port must reproduce. `notes` marks
them `fired from shared api base`.

**Legacy bare names:** the old OO API exposed bare handlers (`onZoom`,
`onDocumentReady`, `onExternalPluginMessage`, …) that consumers assigned directly;
the modern interface is `asc_on*` via `asc_registerCallback`. The historical
examples in the task (`onChangeFocus`, `onDocumentModifiedChange`,
`onCoAuthoringDisconnect`) exist in modern bundles only under their `asc_` names
(`asc_onFocusObject`, `asc_onDocumentModifiedChanged`, `asc_onCoAuthoringDisconnect`);
where a bare token survives in the word bundle it is kept as its own row
(`ui_register_sites: 0`, notes flag the legacy interface).

---

## 2. Dataset summary

- **386 events** total = 181 `asc_on*` identifiers found in word/cell/slide
  bundles + 112 ui-registered names from the shared api base + 93 curated legacy
  bare `on*` names.
- UI side: 191 unique registered names across **459 register sites**.
- Word bundle fire-site leader: `asc_onError` (**41** fire sites), then
  `asc_onSelectionEnd` (10), `asc_onUserActionStart`/`End` (8 each).

### Totals per domain (17 distinct)

| domain        | events | example names |
|---------------|-------:|---------------|
| document      |     60 | `asc_onDocumentContentReady`, `asc_onModifiedDocument`, `asc_onCanUndo` |
| view          |     53 | `asc_onCurrentPage`, `asc_onUpdateScrolls`, `asc_onStartDemonstration` |
| selection     |     47 | `asc_onSelectionChanged`, `asc_onBold`, `asc_onParaStyleName` |
| other         |     56 | PDF forms, signatures, math tracks, XML-parser callbacks |
| table         |     36 | `asc_onEndCalculate`, `asc_onFilterInfo`, `asc_onDefName` |
| plugin        |     32 | `asc_onPluginShow`, `onExternalPluginMessage`, `onMethodReturn` |
| coauth        |     23 | `asc_onCoAuthoringDisconnect`, `asc_onLockDocumentProps` |
| comment       |     11 | `asc_onAddComment`, `asc_onUpdateCommentPosition` |
| track-changes |     11 | `asc_onOnTrackRevisionsChange`, `asc_onChangeDisplayModeInReview` |
| focus         |     10 | `asc_onFocusObject`, `asc_onShowContentControlsActions` |
| chart         |      9 | `asc_onUpdateChartStyles`, `asc_onSingleChartSelectionChanged` |
| macro         |      9 | `asc_onMacroRecordingStart`, `asc_onRunAutostartMacroses` |
| print         |      8 | `asc_onPrint`, `asc_onStartMailMerge` |
| search        |      7 | `asc_onSearchEnd`, `asc_onReplaceAll` |
| proofing      |      5 | `asc_onSpellCheckVariantsFound`, `asc_onTextLanguage` |
| zoom          |      4 | `asc_onZoomChanged`, `asc_onZoomChange` |
| collaboration |      5 | `asc_onApplyChanges`, `asc_onCollaborativeChanges` |

**Translation domain: 0 events.** OO exposes translation only as a plugin
*method* call (`executeMethod`), never as an engine→UI callback — a wasm port
must keep it out of the event enum. This is a structural finding, not an omission.

---

## 3. The ~15 highest-frequency UI-registered callbacks

| # | name | sites | WO equivalent today |
|--:|------|------:|---------------------|
| 1 | `asc_onCoAuthoringDisconnect` | 27 | collab WS frames + `scheduleCollabSync()` in editor.js (partial) |
| 2 | `asc_onFocusObject` | 18 | none — toolbar context switching missing |
| 3 | `asc_onDownloadUrl` | 8 | `notifyHost(action, extra)` channel could carry the URL |
| 4 | `asc_onTextLanguage` | 8 | none — language per selection not tracked |
| 5 | `asc_onImgWrapStyleChanged` | 7 | none |
| 6 | `asc_onShowContentControlsActions` | 7 | none (WO content controls exist in model, no UI actions) |
| 7 | `asc_onHideContentControlsActions` | 7 | none |
| 8 | `asc_onUpdateSignatures` | 6 | none (no signature feature) |
| 9 | `asc_onUpdateOFormRoles` | 6 | none (no PDF-form roles) |
| 10 | `asc_onZoomChange` | 6 | JS-owned viewport scale, no event |
| 11 | `asc_onLockDocumentProps` | 5 | collab op-lock model exists server-side; no UI frame |
| 12 | `asc_onUnLockDocumentProps` | 5 | same |
| 13 | `asc_onContextMenu` | 5 | **existing**: `ctx-menu` CustomEvent + `contextmenu` DOM listener |
| 14 | `asc_onError` | 5 | shell progress hook only (41 fire sites in SDK — richest funnel) |
| 15 | `asc_onStartUpdateExternalReference` | 4 | none (no external references) |

---

## 4. Spec — Rust enum `WsEvent` for `wo-renderer-wasm`

The engine must be able to *push* state to the UI. Today `wo-renderer-wasm` has
no event enum; every notification is either recomputed by JS after a pull call
(`get_selection_rects`) or funneled into the one-string `notifyHost(action)`
channel, which cannot carry payloads. Proposal:

```rust
// core/crates/wo-renderer-wasm/src/events.rs  (new module)
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Engine → UI event frame. One WsEvent == one JSON object crossing the
/// wasm boundary; the UI consumes it through a single sink (see below).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "payload", rename_all = "snake_case")]
pub enum WsEvent {
    // ---- selection & focus (fired on every selection change) ----
    SelectionEnd,
    SelectionChanged { rects: Vec<Rect>, cursor: Option<Pos> },
    FocusObject       { kind: String },            // "text"|"image"|"chart"|"table"|"control"
    ToolbarState {                                  // collapsed asc_onBold/Italic/FontSize/... family
        bold: Option<bool>, italic: Option<bool>, underline: Option<bool>,
        strikeout: Option<bool>, font_size: Option<f64>, font_family: Option<String>,
        para_style: Option<String>, align: Option<String>, vertical_align: Option<String>,
        text_color: Option<String>,
    },
    ZoomChanged { scale: f64 },
    CurrentPage { page: u32, visible_pages: Vec<u32>, count_pages: u32 },

    // ---- document lifecycle & history ----
    DocumentContentReady { pages: u32 },
    DocumentModifiedChanged { modified: bool },
    CanUndoRedo   { undo: bool, redo: bool },
    Error         { code: i32, message: String },
    LongAction    { begin: bool, id: String, text: String },  // asc_onStartAction/EndAction
    DownloadUrl   { url: String },                            // asc_onDownloadUrl

    // ---- co-editing ----
    CoAuthoringDisconnect { reason: String },
    AuthParticipantsChanged { users: Vec<Collaborator> },
    ForeignCursor { show: bool, user_id: String, label: String, pos: Option<Pos> },
    LockDocumentProps { locked: bool, user_id: Option<String> },

    // ---- review / comments ----
    TrackRevisionsChange { on: bool },
    AddComment   { id: String, data: Value },
    RemoveComment { id: String },
    UpdateCommentPosition { id: String, rects: Vec<Rect> },

    // ---- proofing / view misc ----
    SpellCheckVariants { word: String, variants: Vec<String>, lang: String },
    TextLanguage { lang: String },
    UpdateScrolls { h: ScrollState, v: ScrollState },
    ContextMenu { screen: Pos, on_object: bool },
    PluginEvent { guid: String, data: Value },
    Other       { name: String, data: Value },   // 1:1 fallback for the long tail
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pos  { pub x: f64, pub y: f64 }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollState { pub pos: f64, pub max: f64 }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collaborator { pub id: String, pub name: String, pub color: String }
```

Wire shape (serde externally the frame editor.js receives):

```json
{ "seq": 42, "event": "selection_changed",
  "payload": { "rects": [{"x":10,"y":20,"w":180,"h":24}], "cursor": {"x":190,"y":20} } }
{ "seq": 43, "event": "document_modified_changed", "payload": { "modified": true } }
{ "seq": 44, "event": "toolbar_state",
  "payload": { "bold": true, "italic": false, "font_size": 12, "para_style": "Heading 1" } }
```

`seq` is added by the dispatcher (monotonic per session), not by the enum.

### Sink + dispatcher integration

`wasm-bindgen` cannot "return" events; the engine calls one JS closure. Add to
`wo-renderer-wasm/src/lib.rs` (the crate today has 35 exports and **no** event
mechanism — grep `event` over the crate is empty):

```rust
#[wasm_bindgen]
pub fn set_event_sink(sink: js_sys::Function) { EVENTS.with(|e| *e.borrow_mut() = Some(sink)); }

pub(crate) fn emit(ev: &WsEvent) {
    EVENTS.with(|e| {
        if let Some(f) = e.borrow().as_ref() {
            let _ = f.call1(&JsValue::NULL, &JsValue::from_serde(ev).unwrap());
        }
    });
}
```

`editor.js` side (single dispatcher, same style as its existing `ctx-menu` /
`wo-command` CustomEvent plumbing):

```js
wasm.set_event_sink((frame) => {
  frame = { seq: ++seq, ...frame };
  switch (frame.event) {                       // snake_case == WsEvent variant name
    case "selection_end":            updateCaret(); break;
    case "toolbar_state":            syncToolbar(frame.payload); break;
    case "document_modified_changed": notifyHost(frame.payload.modified ? "editing" : "saved"); break;
    case "context_menu":             openCtxMenu(frame.payload); break;
    case "co_authoring_disconnect":  showDisconnectBanner(frame.payload.reason); break;
    default: window.dispatchEvent(new CustomEvent("wo-event", { detail: frame }));
  }
});
```

This reuses the *existing* editor.js dispatcher idioms — `notifyHost(action)`
keeps its meaning, unknown frames fan out as `wo-event` CustomEvents exactly like
`wo-command` does in the inverse direction — and no OO event can be lost because
`WsEvent::Other { name }` preserves the long tail 1:1.

### Mapping rule used in `wasm-events.json`

`wo_equivalent` values use a small fixed vocabulary:

- `missing: add WsEvent::X frame (...)` — nothing in WO consumes it today (majority).
- `partial: notifyHost('editing'|'saved') ...` — covered only as a dirty/saved flag.
- `wasm pull: <export>() ...` — information is obtainable by polling an existing
  export but no push frame exists.
- `dom: addEventListener('<x>') ...` — a DOM event in editor.js covers part of it.
- `existing: ...` — a real WO channel already serves it (`wo-command`, collab WS
  frames, `ctx-menu`).

Variant names in the enum are derived mechanically: strip `asc_on`/`on`, split
camel humps, snake_case (`asc_onDocumentModifiedChanged` →
`document_modified_changed`). Keep both zoom names (`zoom_changed` **and** the
legacy `zoom_change`) as distinct variants so old UI consumers still match.

---

## 5. Rollout recommendation

1. **Phase 1 (15 variants, ~85% of UI value):** `SelectionEnd`, `ToolbarState`,
   `FocusObject`, `DocumentModifiedChanged`, `DocumentContentReady`, `CanUndoRedo`,
   `ZoomChanged`, `CurrentPage`, `Error`, `LongAction`, `ContextMenu`,
   `CoAuthoringDisconnect`, `AuthParticipantsChanged`, `LockDocumentProps`,
   `DownloadUrl` — these are exactly the top-registered names above and every one
   maps onto an editor.js handler that exists or is stubbed.
2. **Phase 2:** comments, track-changes, proofing (`SpellCheckVariants` builds on
   the existing `spell_suggest`/`spell_check_word` wasm exports).
3. **Phase 3:** plugin/`PluginEvent` (replaces ad-hoc `wo-command` bridging),
   table/chart/view long tail via `Other { name }` fallback.

Deviations from the task's example list: `onChangeFocus`/`onDocumentModifiedChange`
do not exist as bare tokens in the sampled bundles (they are `asc_onFocusObject`
and `asc_onDocumentModifiedChanged` there); `onMethod` exists only as
`onMethodReturn`/`asc_onPluginMethodReturn` (plugin method bridge) — both are
covered as `plugin`-domain rows.
