/**
 * WO-20 page-color-none: OO "No Color" (Layout > Page Color)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Page Color dialog exposes a "No Color" item that
 * clears the page-background override (--paper -> removed) so the page
 * renders with default white paper, is wired through the wo-command bus,
 * and marks the document dirty.
 *
 * Run with: node page-color-none.test.mjs
 * Success: prints "PAGE-COLOR-NONE-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const wordCommandsPath = new URL("./lib/word-commands.ts", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const wordCommandsSrc = readFileSync(wordCommandsPath, "utf-8")

console.log("Running WO-20 page-color-none tests...\n")

// ── index.html: the No Color item lives in the Page Color dialog ────

assert.ok(
  htmlSrc.includes('id="btn-pagecolor-none"'),
  "WO-20: pagecolor dialog must expose a No Color button (btn-pagecolor-none)",
)
assert.ok(
  htmlSrc.includes('data-i18n="Layout.PageColorNone"'),
  "WO-20: No Color button must carry the Layout.PageColorNone i18n key",
)
const pageColorDialog = htmlSrc.slice(
  htmlSrc.indexOf('id="pagecolor-dialog"'),
  htmlSrc.indexOf('id="colors-dialog"'),
)
assert.ok(
  pageColorDialog.includes('id="btn-pagecolor-none"'),
  "WO-20: No Color button must be inside the pagecolor-dialog",
)

// ── i18n: No Color must be translated ───────────────────────────────

assert.ok(
  i18nSrc.includes('"Layout.PageColorNone": "No Color"'),
  "WO-20: English Layout.PageColorNone i18n must exist",
)
assert.ok(
  i18nSrc.includes('"Layout.PageColorNone": "Keine Farbe"'),
  "WO-20: German Layout.PageColorNone i18n must exist",
)

// ── lib/word-commands.ts: a real wo-command exists ──────────────────

assert.ok(
  wordCommandsSrc.includes("pageColorNone"),
  "WO-20: word-commands.ts must define the pageColorNone command",
)
assert.ok(
  wordCommandsSrc.includes('name: "pageColorNone"'),
  "WO-20: pageColorNone WordCommand must carry the pageColorNone name",
)
assert.ok(
  wordCommandsSrc.includes('"pageColorNone"'),
  "WO-20: pageColorNone must be listed in WORD_COMMANDS",
)

// ── editor.js: clear the --paper override and mark the doc dirty ────

// The clear action must remove (not merely re-color) the page background,
// reverting to default white paper.
assert.ok(
  editorSrc.includes("function clearPageColor"),
  "WO-20: editor.js must define a clearPageColor action",
)
assert.ok(
  editorSrc.includes('removeProperty("--paper")'),
  "WO-20: clearPageColor must remove the --paper override",
)
assert.ok(
  editorSrc.includes("clearPageColor()") && editorSrc.includes("markDirty()"),
  "WO-20: clearPageColor must mark the document dirty",
)

// ── editor.js: wired through the wo-command bus ─────────────────────

assert.ok(
  editorSrc.includes('cmd === "pageColorNone"'),
  "WO-20: runCommand must handle the pageColorNone command",
)
assert.ok(
  editorSrc.includes('emitCommand("pageColorNone")'),
  "WO-20: No Color button must emit the pageColorNone wo-command",
)
assert.ok(
  editorSrc.includes("btn-pagecolor-none"),
  "WO-20: editor.js must wire the btn-pagecolor-none control",
)

console.log("All WO-20 page-color-none tests passed!\n")
console.log("PAGE-COLOR-NONE-PASS")
