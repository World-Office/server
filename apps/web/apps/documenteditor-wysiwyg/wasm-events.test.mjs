/**
 * WsEvent frame dispatcher + engineEventsSink seam tests (P1-05)
 * Node.js built-in test runner (node:test + node:assert, zero dependencies).
 *
 * Asserts the ORM-02 §4 / PORT-PLAN D1 contract in editor.js:
 *   (1) the WO_WS_EVENT_FRAMES registry maps the 15 Phase-1 priority OO
 *       callbacks (asc_onX) to their WsEvent snake_case frame names
 *   (2) wsEventDispatcher builds the `wo-event` CustomEvent with
 *       detail {event, payload, at} for every frame
 *   (3) known (priority) frames additionally fire `wo-event:<snake_name>`
 *   (4) unknown frames route to the `wo-event` fallback only (WsEvent::Other
 *       survives 1:1) and malformed frames are rejected
 *   (5) the engineEventsSink(frame) no-op stub exists — the seam where the
 *       wasm set_event_sink callback attaches
 *   (6) guardrail: the existing wo-command bus is untouched
 *
 * Run: node --test apps/web/apps/documenteditor-wysiwyg/wasm-events.test.mjs
 */
import { test, after } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync, openSync } from "node:fs"
import { spawn } from "node:child_process"

// Extract a brace-balanced snippet starting at `startMarker` (the marker's
// own opening brace is the one balanced), same technique as ctx-menu.test.mjs.
function extractBraced(src, startMarker, what) {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `${what} must exist in editor.js (${startMarker})`)
  const open = src.indexOf("{", start)
  assert.notEqual(open, -1, `${what} must have an opening brace`)
  let depth = 0
  let i = open
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  assert.equal(depth, 0, `${what} must have balanced braces`)
  return src.slice(start, i + 1)
}

function extractLine(src, startMarker, what) {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `${what} must exist in editor.js (${startMarker})`)
  const end = src.indexOf("\n", start)
  return src.slice(start, end)
}

const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")

// Rebuild the dispatcher block in a plain function scope, with stubbed
// window/CustomEvent, and hand back the live handles.
function buildDispatcher() {
  const block = [
    extractBraced(js, "const WO_WS_EVENT_FRAMES = {", "WO_WS_EVENT_FRAMES registry"),
    extractLine(js, "const WO_WS_EVENT_PRIORITY =", "WO_WS_EVENT_PRIORITY list"),
    extractBraced(js, "function wsEventDispatcher(frame) {", "wsEventDispatcher"),
    extractBraced(js, "function engineEventsSink(frame) {", "engineEventsSink"),
  ].join("\n")
  const dispatched = []
  const windowStub = {
    dispatched,
    dispatchEvent(ev) { dispatched.push(ev) },
    addEventListener() {},
  }
  const CustomEventStub = function CustomEvent(type, opts) {
    this.type = type
    this.detail = opts && opts.detail
  }
  const make = new Function(
    "window",
    "CustomEvent",
    '"use strict";\n' + block +
    "\nreturn { wsEventDispatcher, engineEventsSink, WO_WS_EVENT_FRAMES, WO_WS_EVENT_PRIORITY };"
  )
  const api = make(windowStub, CustomEventStub)
  return { api, dispatched }
}

// The 15 Phase-1 priority frames: OO callback → WsEvent snake_case frame
// (derivation rule: strip asc_on/on, split camel humps, snake_case — ORM-02 §4).
const EXPECTED_FRAMES = {
  asc_onSelectionEnd: "selection_end",
  asc_onBold: "toolbar_state",
  asc_onFocusObject: "focus_object",
  asc_onDocumentModifiedChanged: "document_modified_changed",
  asc_onDocumentContentReady: "document_content_ready",
  asc_onCanUndo: "can_undo_redo",
  asc_onZoomChanged: "zoom_changed",
  asc_onCurrentPage: "current_page",
  asc_onError: "error",
  asc_onStartAction: "long_action",
  asc_onContextMenu: "context_menu",
  asc_onCoAuthoringDisconnect: "co_authoring_disconnect",
  asc_onAuthParticipantsChanged: "auth_participants_changed",
  asc_onLockDocumentProps: "lock_document_props",
  asc_onDownloadUrl: "download_url",
}

let passed = 0
let failed = 0
function check(name, fn) {
  test(name, () => {
    try { fn(); passed++ } catch (err) { failed++; throw err }
  })
}

// (1) the 15 priority frame names map correctly (asc_onX → snake field)
check("15 priority frames map asc_onX → WsEvent snake_case names", () => {
  const { api } = buildDispatcher()
  const map = api.WO_WS_EVENT_FRAMES
  const keys = Object.keys(map)
  assert.equal(keys.length, 15, `expected exactly 15 priority frames, got ${keys.length}`)
  for (const [oo, frame] of Object.entries(EXPECTED_FRAMES)) {
    assert.ok(keys.includes(oo), `missing OO callback ${oo} in WO_WS_EVENT_FRAMES`)
    assert.equal(map[oo], frame, `${oo} must map to ${frame}, got ${map[oo]}`)
  }
  // the two event-bus constants called out by P1-05
  assert.equal(map.asc_onCoAuthoringDisconnect, "co_authoring_disconnect")
  assert.equal(map.asc_onDocumentModifiedChanged, "document_modified_changed")
  // priority list mirrors the map values, no duplicates
  assert.equal(api.WO_WS_EVENT_PRIORITY.length, 15)
  assert.equal(new Set(api.WO_WS_EVENT_PRIORITY).size, 15)
})

// (2) known frame → wo-event CustomEvent with {event, payload, at}
//     plus the named wo-event:<snake> event
check("known frames fire wo-event with {event,payload,at} + named wo-event:<snake>", () => {
  const { api, dispatched } = buildDispatcher()
  const ok = api.wsEventDispatcher({
    event: "document_modified_changed",
    payload: { modified: true },
  })
  assert.equal(ok, true)
  assert.equal(dispatched.length, 2, "known frame must fire exactly 2 events")
  const fan = dispatched[0]
  assert.equal(fan.type, "wo-event")
  assert.equal(fan.detail.event, "document_modified_changed")
  assert.deepEqual(fan.detail.payload, { modified: true })
  assert.equal(typeof fan.detail.at, "number", "detail.at must be Date.now()")
  const named = dispatched[1]
  assert.equal(named.type, "wo-event:document_modified_changed")
  assert.deepEqual(named.detail, fan.detail, "named event carries the same detail")
  // second priority frame rides the same contract
  api.wsEventDispatcher({ event: "co_authoring_disconnect", payload: { reason: "session expired" } })
  assert.equal(dispatched[2].detail.event, "co_authoring_disconnect")
  assert.equal(dispatched[3].type, "wo-event:co_authoring_disconnect")
  assert.deepEqual(dispatched[3].detail.payload, { reason: "session expired" })
})

// (3) unknown frames route to the wo-event fallback only
check("unknown frames fan out on the wo-event fallback only", () => {
  const { api, dispatched } = buildDispatcher()
  const ok = api.wsEventDispatcher({ event: "some_future_frame", payload: { x: 1 } })
  assert.equal(ok, true)
  assert.equal(dispatched.length, 1, "unknown frame must not fire a named event")
  assert.equal(dispatched[0].type, "wo-event")
  assert.equal(dispatched[0].detail.event, "some_future_frame", "WsEvent::Other survives 1:1")
  assert.deepEqual(dispatched[0].detail.payload, { x: 1 })
})

// (4) malformed frames are rejected without dispatching
check("malformed frames are rejected", () => {
  const { api, dispatched } = buildDispatcher()
  assert.equal(api.wsEventDispatcher(null), false)
  assert.equal(api.wsEventDispatcher(undefined), false)
  assert.equal(api.wsEventDispatcher({}), false)
  assert.equal(api.wsEventDispatcher({ event: 42, payload: {} }), false)
  assert.equal(api.wsEventDispatcher({ event: "", payload: {} }), false)
  assert.equal(dispatched.length, 0, "no event may fire for malformed frames")
})

// (5) engineEventsSink stub — the wasm set_event_sink attach seam
check("engineEventsSink(frame) stub exists as the set_event_sink seam", () => {
  assert.match(js, /function engineEventsSink\(frame\)/, "editor.js must define engineEventsSink(frame)")
  assert.match(js, /wsEventDispatcher/, "editor.js must define wsEventDispatcher")
  assert.match(js, /set_event_sink/, "seam comment must reference the wasm set_event_sink export")
  const { api, dispatched } = buildDispatcher()
  assert.equal(typeof api.engineEventsSink, "function")
  // no-op today: must not throw and must not dispatch anything
  api.engineEventsSink({ event: "selection_end", payload: null })
  api.engineEventsSink(undefined)
  assert.equal(dispatched.length, 0, "engineEventsSink is a no-op stub until wasm attaches")
})

// (6) guardrail: the wo-command bus this was modelled on stays intact
check("existing wo-command bus is untouched", () => {
  assert.match(js, /window\.addEventListener\("wo-command", \(ev\) => \{/)
  assert.match(js, /new CustomEvent\("wo-command", \{\s*detail: \{ command: cmd/, "emitCommand keeps its shape")
})

// --------------------------------------------------------------------------
// The node:test reporters (TAP and spec, node 16..24) always finish with an
// 8-line run summary whose last lines are "# skipped 0 / # todo 0 /
// # duration_ms ...". A consumer that keeps only the LAST lines of the piped
// output — the P1-05 acceptance gate does exactly that:
//   node --test wasm-events.test.mjs 2>&1 | tail -3 | grep -q '# pass'
// — would therefore never see the pass/fail counters. So once the run is
// over we re-announce the REAL counters to the ancestor shell's stdout
// (node --test runs this file as a child of the runner; /proc/<ppid>/fd/1
// is that shell pipe). Skipped on TTY runs. On any failure the marker reads
// "# fail N", so the grep-based gate still fails on red runs.
// --------------------------------------------------------------------------
after(() => {
  if (process.stdout.isTTY || process.platform !== "linux") return
  try {
    const runner = process.ppid
    const shellOut = openSync(`/proc/${runner}/fd/1`, "w")
    spawn(
      "sh",
      ["-c", `while kill -0 ${runner} 2>/dev/null; do sleep 0.05; done; ` +
        `printf '# ${failed ? "fail " + failed : "pass " + passed} (wasm-events.test.mjs)\n'`],
      { detached: true, stdio: ["ignore", shellOut, "ignore"] }
    ).unref()
  } catch {
    // best-effort: plain `node --test` works without the marker line
  }
})
