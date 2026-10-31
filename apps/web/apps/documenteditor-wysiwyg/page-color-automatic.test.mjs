/**
 * WO-20 page-color-automatic: OO "Automatic" (Layout > Page Color)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Page Color dialog exposes an "Automatic" item that
 * resets the page background to the default (white/automatic — removes the
 * --paper override), keeps the dialog in sync by showing Automatic as the
 * current value when --paper is unset, and is wired through the wo-command
 * bus (pageColorAutomatic) like every other formatting edit.
 *
 * Run with: node page-color-automatic.test.mjs
 * Success: prints "PAGE-COLOR-AUTOMATIC-PASS" and exits 0.
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

console.log("Running WO-20 page-color-automatic tests...\n")

// ── index.html: the Automatic item lives in the Page Color dialog ───

assert.ok(
  htmlSrc.includes('id="btn-pagecolor-automatic"'),
  "WO-20: pagecolor dialog must expose an Automatic button (btn-pagecolor-automatic)",
)
assert.ok(
  htmlSrc.includes('data-i18n="Layout.PageColorAutomatic"'),
  "WO-20: Automatic button must carry the Layout.PageColorAutomatic i18n key",
)
const pageColorDialog = htmlSrc.slice(
  htmlSrc.indexOf('id="pagecolor-dialog"'),
  htmlSrc.indexOf('id="colors-dialog"'),
)
assert.ok(
  pageColorDialog.includes('id="btn-pagecolor-automatic"'),
  "WO-20: Automatic button must be inside the pagecolor-dialog",
)

// ── i18n: Automatic must be translated ─────────────────────────────

assert.ok(
  i18nSrc.includes('"Layout.PageColorAutomatic": "Automatic"'),
  "WO-20: English Layout.PageColorAutomatic i18n must exist",
)
assert.ok(
  i18nSrc.includes('"Layout.PageColorAutomatic": "Automatisch"'),
  "WO-20: German Layout.PageColorAutomatic i18n must exist",
)

// ── lib/word-commands.ts: a real wo-command exists ──────────────────

assert.ok(
  wordCommandsSrc.includes("pageColorAutomatic"),
  "WO-20: word-commands.ts must define the pageColorAutomatic command",
)
assert.ok(
  wordCommandsSrc.includes('name: "pageColorAutomatic"'),
  "WO-20: pageColorAutomatic WordCommand must carry the pageColorAutomatic name",
)
assert.ok(
  wordCommandsSrc.includes('"pageColorAutomatic"'),
  "WO-20: pageColorAutomatic must be listed in WORD_COMMANDS",
)

// ── editor.js: Automatic resets the page to default white ──────────

// The automatic action must remove the explicit --paper override so the page
// renders with the default (white/automatic) background.
assert.ok(
  editorSrc.includes("function applyPageColorAutomatic"),
  "WO-20: editor.js must define an applyPageColorAutomatic action",
)
assert.ok(
  editorSrc.includes('removeProperty("--paper")'),
  "WO-20: applyPageColorAutomatic must remove the --paper override",
)
assert.ok(
  editorSrc.includes("pageColorAutomatic = true"),
  "WO-20: applyPageColorAutomatic must mark Automatic as the current value",
)
assert.ok(
  editorSrc.includes("applyPageColorAutomatic()") && editorSrc.includes("markDirty()"),
  "WO-20: applyPageColorAutomatic must mark the document dirty",
)

// ── editor.js: dialog stays in sync (Automatic shown when --paper unset)

assert.ok(
  editorSrc.includes('editor.style.getPropertyValue("--paper") !== ""'),
  "WO-20: openPageColorDialog must detect whether --paper is unset",
)
assert.ok(
  editorSrc.includes("pageColorAutomatic = !hasPaper"),
  "WO-20: openPageColorDialog must treat unset --paper as Automatic",
)
assert.ok(
  editorSrc.includes('if (autoBtn) autoBtn.classList.toggle("sel", pageColorAutomatic)'),
  "WO-20: openPageColorDialog must show Automatic as the current value when --paper is unset",
)
assert.ok(
  editorSrc.includes("if (pageColorAutomatic) { applyPageColorAutomatic(); return; }"),
  "WO-20: confirmPageColorDialog must apply Automatic when it is the current value",
)

// ── editor.js: wired through the wo-command bus ─────────────────────

assert.ok(
  editorSrc.includes('cmd === "pageColorAutomatic"'),
  "WO-20: runCommand must handle the pageColorAutomatic command",
)
assert.ok(
  editorSrc.includes('emitCommand("pageColorAutomatic")'),
  "WO-20: Automatic button must emit the pageColorAutomatic wo-command",
)
assert.ok(
  editorSrc.includes("btn-pagecolor-automatic"),
  "WO-20: editor.js must wire the btn-pagecolor-automatic control",
)

console.log("All WO-20 page-color-automatic tests passed!\n")
console.log("PAGE-COLOR-AUTOMATIC-PASS")
