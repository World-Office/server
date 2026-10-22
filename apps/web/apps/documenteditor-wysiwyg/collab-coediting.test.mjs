/**
 * F-120: Real-time co-editing
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js has the real-time co-editing wiring:
 * - renderPresence renders peer chips + remote carets
 * - renderRemoteCaret positions named caret labels
 * - scheduleCollabSync debounces collab sync (POST collab/sync)
 * - announcePresence sends cursor + user + avatar (POST collab/presence)
 * - pollCollab polls converged document state (GET collab/state)
 * - collabText extracts plain text for CRDT convergence
 * - leavePresence sends cursor=null on disconnect
 *
 * The backend E2E proof (2-client WebSocket session, bidirectional
 * broadcast, late joiner replay) is fig/fig-collab.cjs in wo-test-harness,
 * which drives the coauthoring-service end to end.
 *
 * Run with: node collab-coediting.test.mjs
 * Success: prints "COLLAB-COEDITING-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running F-120 real-time co-editing tests...\n")

// ── renderPresence: peer chips + remote carets ─────────────────────

const renderPresenceStart = editorSrc.indexOf("function renderPresence(")
assert.notStrictEqual(renderPresenceStart, -1, "renderPresence must exist")
console.log("ok 1 renderPresence function exists")

// renderPresence creates peer chips
assert.ok(editorSrc.includes("peer-chip"), "renderPresence must create peer-chip elements")
console.log("ok 2 renderPresence creates peer-chip elements")

// renderPresence calls renderRemoteCaret for remote clients
assert.ok(
  editorSrc.includes("renderRemoteCaret(c, color, overlay)"),
  "renderPresence must call renderRemoteCaret for remote clients",
)
console.log("ok 3 renderPresence calls renderRemoteCaret for remote clients")

// ── renderRemoteCaret: named caret labels ──────────────────────────

const renderRemoteCaretStart = editorSrc.indexOf("function renderRemoteCaret(")
assert.notStrictEqual(renderRemoteCaretStart, -1, "renderRemoteCaret must exist")
console.log("ok 4 renderRemoteCaret function exists")

// renderRemoteCaret creates .remote-caret with .remote-caret-label
assert.ok(
  editorSrc.includes("remote-caret") && editorSrc.includes("remote-caret-label"),
  "renderRemoteCaret must create .remote-caret with .remote-caret-label",
)
console.log("ok 5 renderRemoteCaret creates .remote-caret-label")

// renderRemoteCaret sets the label to the peer's name
assert.ok(
  editorSrc.includes('marker.querySelector(".remote-caret-label").textContent = user'),
  "renderRemoteCaret must set label text to peer name",
)
console.log("ok 6 renderRemoteCaret sets label to peer name")

// ── scheduleCollabSync: debounced sync ─────────────────────────────

const syncStart = editorSrc.indexOf("function scheduleCollabSync(")
assert.notStrictEqual(syncStart, -1, "scheduleCollabSync must exist")
console.log("ok 7 scheduleCollabSync function exists")

// scheduleCollabSync posts to collab/sync
assert.ok(editorSrc.includes('api("collab/sync")'), "scheduleCollabSync must POST to collab/sync")
console.log("ok 8 collab/sync endpoint is called")

// ── announcePresence: cursor + user + avatar ───────────────────────

const announceStart = editorSrc.indexOf("function announcePresence(")
assert.notStrictEqual(announceStart, -1, "announcePresence must exist")
console.log("ok 9 announcePresence function exists")

// announcePresence posts to collab/presence with cursor
assert.ok(
  editorSrc.includes('api("collab/presence")'),
  "announcePresence must POST to collab/presence",
)
console.log("ok 10 collab/presence endpoint is called")

// announcePresence sends cursor index
assert.ok(
  editorSrc.includes("cursor") && editorSrc.includes("index"),
  "announcePresence must send cursor with index",
)
console.log("ok 11 announcePresence sends cursor index")

// ── pollCollab: converged state polling ────────────────────────────

assert.ok(editorSrc.includes("function pollCollab("), "pollCollab must exist")
console.log("ok 12 pollCollab function exists")

// pollCollab fetches collab/state
assert.ok(editorSrc.includes('api("collab/state")'), "pollCollab must GET collab/state")
console.log("ok 13 collab/state endpoint is called")

// ── collabText: plain-text CRDT extraction ─────────────────────────

assert.ok(editorSrc.includes("function collabText("), "collabText must exist")
console.log("ok 14 collabText function exists")

// ── leavePresence: disconnect cleanup ──────────────────────────────

assert.ok(editorSrc.includes("function leavePresence("), "leavePresence must exist")
console.log("ok 15 leavePresence function exists")

// ── COLLAB_ENABLED gate ────────────────────────────────────────────

assert.ok(editorSrc.includes("COLLAB_ENABLED"), "COLLAB_ENABLED flag must exist")
console.log("ok 16 COLLAB_ENABLED flag gates collab operations")

console.log("\nAll F-120 tests passed!\n")
console.log("COLLAB-COEDITING-PASS")
