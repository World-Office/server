# P1-05 — JS WsEvent frame dispatcher + engineEventsSink seam in editor.js

Implements PORT-PLAN Phase 1 item 1, second half (D1): the **editor.js consumer**
of the `WsEvent` frames. ORM-01 (`wasm-api.md`) covered the JS→engine calls, and
the P1-01..03 workers landed the Rust push channel (`WsEvent` enum +
`set_event_sink`/`emit_event`/`push` in `wo-renderer-wasm`); this task is the
UI side of that channel. Spec source: `wasm-events.md` §4 (wire shape) and §5
(the 15 Phase-1 priority frames).

## What landed

All inside the IIFE of `apps/web/apps/documenteditor-wysiwyg/editor.js`,
directly after the existing `wo-command` event bus (the established
engine↔UI plumbing idiom — this block is its mirror image). No existing code
was refactored or reformatted; the diff is purely additive.

| piece | what it is |
|---|---|
| `WO_WS_EVENT_FRAMES` | const map: OO `asc_registerCallback` name → WsEvent snake_case frame name. Exactly the **15 Phase-1 priority frames** (ORM-02 §5, ~85% of UI value), including the two constants P1-05 calls out: `asc_onCoAuthoringDisconnect → co_authoring_disconnect` and `asc_onDocumentModifiedChanged → document_modified_changed`. Family frames note their sibling callbacks in comments (`asc_onCanRedo` rides `can_undo_redo`, `asc_onEndAction` rides `long_action`). |
| `WO_WS_EVENT_PRIORITY` | derived list of the 15 frame names (known-frame set). |
| `wsEventDispatcher(frame)` | single consumer of `{event, payload}` frames. Always fires `window "wo-event"` with `detail {event, payload, at: Date.now()}`; known (priority) frames additionally fire `wo-event:<snake_name>`; unknown frames ride the plain `wo-event` fallback only, so `WsEvent::Other` and the whole long tail survive 1:1. Malformed frames (falsy, or `event` not a non-empty string) are rejected with `false`, no dispatch. Returns `true` when dispatched. |
| `engineEventsSink(frame)` | **no-op stub** — the exact seam where the wasm `set_event_sink` callback attaches (comment points at `wasm-events.md` §4). Once the wasm module is wired into this page, its whole body becomes `return wsEventDispatcher(frame);`. |
| `window.wsEventDispatcher` / `window.engineEventsSink` | host-visible handles (same idiom as `window.replayCommands`), so the wasm glue can attach from outside the IIFE. |

### Wire-up contract (when the wasm module loads)

```js
wasm.set_event_sink((frame) => window.engineEventsSink(frame));
// engineEventsSink(frame) → wsEventDispatcher(frame) → window "wo-event" + "wo-event:<event>"
```

One function crosses the boundary in each direction; the frame contract stays
in one place, and editor.js's own listeners subscribe via
`window.addEventListener("wo-event:<event>", …)` (e.g. `wo-event:selection_end`,
`wo-event:document_modified_changed`, `wo-event:zoom_changed`) exactly as
they already do for `wo-command` in the inverse direction.

Machine-readable registry: `apps/web/apps/documenteditor-wysiwyg/events.json`
(bus contract + the 15 priority frames with payload shapes; verified 1:1
against the editor.js map).

## Derivation rule (frame names)

Strip `asc_on`/`on`, split camel humps, snake_case — same rule ORM-02 used for
the Rust variant names, so `asc_onDocumentModifiedChanged` → variant
`DocumentModifiedChanged` → frame `document_modified_changed`. Both zoom names
stay distinct engine-side (`zoom_changed` and legacy `zoom_change`); Phase 1
maps `asc_onZoomChanged → zoom_changed`.

## Guardrails respected

- No existing event names touched: `wo-command`, `ctx-menu`,
  `wo:chart-settings`, `wo:print-selection`, `wo:keep-lines`, `odt-persisted`,
  `lists-persisted`, `images-persisted`, `wo-open-file` are byte-identical
  (pinned by test 6 of the new suite).
- No reformatting of untouched code; the block is inserted between the
  `wo-command` listener and the agent-command-recorder section.
- No new dependencies, no index.html change needed (the dispatcher is
  IIFE-internal and needs no DOM wiring).

## Tests

New `apps/web/apps/documenteditor-wysiwyg/wasm-events.test.mjs`
(node:test + node:assert, zero deps, extraction style of `ctx-menu.test.mjs`).
It rebuilds the dispatcher block from editor.js in a stubbed
`window`/`CustomEvent` scope and asserts, live, that:

1. the map holds exactly the 15 priority `asc_onX → snake` pairs (incl. the two
   called-out constants);
2. a known frame fires `wo-event` with `{event, payload, at}` **plus** the
   named `wo-event:<snake>` with the same detail;
3. an unknown frame fires `wo-event` only, detail preserved (Other survives
   1:1);
4. malformed frames are rejected without dispatching;
5. `engineEventsSink(frame)` exists as a callable no-op stub and the seam
   comment references `set_event_sink`;
6. the `wo-command` bus is untouched (guardrail).

Evidence: `node --test wasm-events.test.mjs` → `# pass 6 / # fail 0`; the full
directory suite (`node --test *.test.mjs`) stays green — 142 tests, 0 failures.
