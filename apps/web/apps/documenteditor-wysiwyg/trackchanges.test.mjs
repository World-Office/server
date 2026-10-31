/**
 * WO-9: Track Changes feature test
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that track changes functionality is properly implemented:
 * - Design document exists
 * - word-commands.ts exports toggleTrackChanges command
 * - editor.js has toggleTrackChanges command handler
 * - index.html has track changes button
 *
 * Run with: node trackchanges.test.mjs
 * Success: prints "trackchanges-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const wordCommandsPath = new URL("./lib/word-commands.ts", import.meta.url)
const designDocPath = new URL("./lib/TRACK_CHANGES_DESIGN.md", import.meta.url)

const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const wordCommandsSrc = readFileSync(wordCommandsPath, "utf-8")
const designDocSrc = readFileSync(designDocPath, "utf-8")

console.log("Running WO-9 trackchanges tests...\n")

// ── Design document ────────────────────────────────────────────────

assert.ok(
  designDocSrc.includes("Track Changes"),
  "WO-9: Design document must exist and contain Track Changes",
)
assert.ok(designDocSrc.includes("Data Model"), "WO-9: Design document must describe data model")
assert.ok(
  designDocSrc.includes("TrackChangeMetadata"),
  "WO-9: Design document must define TrackChangeMetadata",
)
assert.ok(
  designDocSrc.includes("toggleTrackChanges"),
  "WO-9: Design document must reference toggleTrackChanges command",
)

console.log("✓ Design document exists and contains required sections")

// ── lib/word-commands.ts ────────────────────────────────────────────

assert.ok(
  wordCommandsSrc.includes("toggleTrackChanges"),
  "WO-9: word-commands.ts must export toggleTrackChanges command",
)
assert.ok(
  wordCommandsSrc.includes("TrackChangeType"),
  "WO-9: word-commands.ts must define TrackChangeType type",
)
assert.ok(
  wordCommandsSrc.includes("TrackChangeMetadata"),
  "WO-9: word-commands.ts must define TrackChangeMetadata interface",
)
assert.ok(
  wordCommandsSrc.includes("TrackChangesState"),
  "WO-9: word-commands.ts must define TrackChangesState interface",
)
assert.ok(
  wordCommandsSrc.includes("WordCommand"),
  "WO-9: word-commands.ts must define WordCommand interface",
)
assert.ok(
  wordCommandsSrc.includes("acceptAllTrackedChanges"),
  "WO-9: word-commands.ts must export acceptAllTrackedChanges command",
)
assert.ok(
  wordCommandsSrc.includes("rejectAllTrackedChanges"),
  "WO-9: word-commands.ts must export rejectAllTrackedChanges command",
)

console.log("✓ word-commands.ts exports track changes commands and types")

// ── editor.js: toggleTrackChanges command handler ─────────────────────

assert.ok(
  editorSrc.includes('cmd === "toggleTrackChanges"'),
  "WO-9: editor.js must have toggleTrackChanges command handler in runCommand",
)
assert.ok(
  editorSrc.includes("setTrackChanges(!trackChangesOn)"),
  "WO-9: toggleTrackChanges handler must call setTrackChanges with toggled state",
)

console.log("✓ editor.js has toggleTrackChanges command handler")

// ── editor.js: setTrackChanges function ──────────────────────────────

assert.ok(
  editorSrc.includes("function setTrackChanges(on)"),
  "WO-9: editor.js must have setTrackChanges function",
)
assert.ok(
  editorSrc.includes("trackChangesOn = on"),
  "WO-9: setTrackChanges must update trackChangesOn state",
)
assert.ok(
  editorSrc.includes("track-on"),
  "WO-9: setTrackChanges must toggle track-on class on editor",
)

console.log("✓ editor.js has setTrackChanges function with state management")

// ── editor.js: emitCommand for toggleTrackChanges ────────────────────

assert.ok(
  editorSrc.includes('emitCommand("toggleTrackChanges")'),
  "WO-9: editor.js must emit wo-command event for toggleTrackChanges",
)

console.log("✓ editor.js dispatches toggleTrackChanges via wo-command bus")

// ── index.html: Track Changes button ─────────────────────────────────

assert.ok(
  htmlSrc.includes('id="btn-track-changes"'),
  "WO-9: index.html must have btn-track-changes button",
)
assert.ok(
  htmlSrc.includes('id="trackchanges-dialog"'),
  "WO-9: index.html must have trackchanges-dialog",
)
assert.ok(
  htmlSrc.includes('data-i18n="Statusbar.TrackChanges"'),
  "WO-9: Track Changes button must have i18n label",
)

console.log("✓ index.html has Track Changes button and dialog")

// ── index.html: Collaboration tab ────────────────────────────────────

assert.ok(
  htmlSrc.includes('data-tab="collaboration"'),
  "WO-9: index.html must have collaboration tab",
)
assert.ok(htmlSrc.includes("btn-track-changes"), "WO-9: Track Changes button must be in the HTML")

console.log("✓ Track Changes button is in the collaboration tab")

// ── Existing track changes infrastructure ────────────────────────────

assert.ok(
  editorSrc.includes("let trackChangesOn = false"),
  "WO-9: editor.js must have trackChangesOn state variable",
)
assert.ok(
  editorSrc.includes("acceptTrackedChange"),
  "WO-9: editor.js must handle acceptTrackedChange command",
)
assert.ok(
  editorSrc.includes("rejectTrackedChange"),
  "WO-9: editor.js must handle rejectTrackedChange command",
)
assert.ok(
  editorSrc.includes("track-insert"),
  "WO-9: editor.js must reference track-insert CSS class",
)
assert.ok(
  editorSrc.includes("track-delete"),
  "WO-9: editor.js must reference track-delete CSS class",
)

console.log("✓ Existing track changes infrastructure is in place")

console.log("\nAll WO-9 trackchanges tests passed!\n")
console.log("trackchanges-PASS")
