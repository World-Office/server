/**
 * WO-10-asc-gen891: missing-feature (references tab, interact)
 * OnlyOffice parity: Table of Figures insertion
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that:
 * 1. The insertTableOfFigures command exists in lib/word-commands.ts
 * 2. The references tab button is wired to insertTableOfFigures
 * 3. A modal dialog exists for title/label options
 * 4. The command handler inserts a TOC field at the cursor
 *
 * Run with: node asc-gen891.test.mjs
 * Success: prints "asc-gen891-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const libPath = new URL("./lib/word-commands.ts", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const libSrc = readFileSync(libPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-10-asc-gen891 Table of Figures tests...\n")

// ── lib/word-commands.ts: insertTableOfFigures command ──────────────

// The command must be exported in word-commands.ts
assert.ok(
  libSrc.includes("export const insertTableOfFigures: WordCommand"),
  "asc-gen891: insertTableOfFigures command must be exported in word-commands.ts",
)

// The command name must be "insertTableOfFigures"
assert.ok(
  libSrc.includes('name: "insertTableOfFigures"'),
  "asc-gen891: insertTableOfFigures command must have correct name",
)

// The command must be in WORD_COMMANDS array
assert.ok(
  libSrc.includes('"insertTableOfFigures"'),
  "asc-gen891: insertTableOfFigures must be in WORD_COMMANDS array",
)

// ── index.html: references tab button ────────────────────────────────

// The Table of Figures button must exist with data-cmd="insertTableOfFigures"
assert.ok(
  htmlSrc.includes('data-cmd="insertTableOfFigures"'),
  "asc-gen891: Table of Figures button must have data-cmd=insertTableOfFigures in index.html",
)

// The button must be in the references tab
assert.ok(
  htmlSrc.includes('data-i18n="Ref.TableOfFigures"'),
  "asc-gen891: Table of Figures button must have Ref.TableOfFigures i18n key",
)

// ── index.html: modal dialog for title/label options ───────────────

// The tableoffigures-dialog must exist
assert.ok(
  htmlSrc.includes('id="tableoffigures-dialog"'),
  "asc-gen891: tableoffigures-dialog must exist in index.html",
)

// The dialog must have a title input
assert.ok(
  htmlSrc.includes('id="tof-title"'),
  "asc-gen891: tof-title input must exist in the dialog",
)

// The dialog must have a style selector
assert.ok(
  htmlSrc.includes('id="tof-style"'),
  "asc-gen891: tof-style select must exist in the dialog",
)

// The dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-tof-ok"'),
  "asc-gen891: btn-tof-ok button must exist in the dialog",
)
assert.ok(
  htmlSrc.includes('id="btn-tof-close"'),
  "asc-gen891: btn-tof-close button must exist in the dialog",
)

// ── i18n.js: Table of Figures strings ──────────────────────────────

// i18n keys for the dialog must exist
assert.ok(
  i18nSrc.includes('"TableOfFigures.Title": "Insert Table of Figures"'),
  "asc-gen891: TableOfFigures.Title English string must exist",
)
assert.ok(
  i18nSrc.includes('"TableOfFigures.Label": "Label"'),
  "asc-gen891: TableOfFigures.Label English string must exist",
)
assert.ok(
  i18nSrc.includes('"TableOfFigures.DefaultTitle": "List of Figures"'),
  "asc-gen891: TableOfFigures.DefaultTitle English string must exist",
)
assert.ok(
  i18nSrc.includes('"TableOfFigures.Style": "Style"'),
  "asc-gen891: TableOfFigures.Style English string must exist",
)

// German translations must exist
assert.ok(
  i18nSrc.includes('"TableOfFigures.Title": "Abbildungsverzeichnis einfügen"'),
  "asc-gen891: TableOfFigures.Title German string must exist",
)
assert.ok(
  i18nSrc.includes('"TableOfFigures.Label": "Bezeichnung"'),
  "asc-gen891: TableOfFigures.Label German string must exist",
)

// ── editor.js: command handler ─────────────────────────────────────

// The insertTableOfFiguresCommand function must exist
assert.ok(
  editorSrc.includes("function insertTableOfFiguresCommand()"),
  "asc-gen891: insertTableOfFiguresCommand function must exist in editor.js",
)

// The function must open the modal dialog
assert.ok(
  editorSrc.includes('openOverlayDialog("tableoffigures-dialog")'),
  "asc-gen891: insertTableOfFiguresCommand must open tableoffigures-dialog",
)

// The runCommand function must handle insertTableOfFigures
assert.ok(
  editorSrc.includes('cmd === "insertTableOfFigures"'),
  "asc-gen891: runCommand must handle insertTableOfFigures command",
)

// The runCommand handler must call insertTableOfFiguresCommand
assert.ok(
  editorSrc.includes("insertTableOfFiguresCommand()"),
  "asc-gen891: runCommand must call insertTableOfFiguresCommand()",
)

// The OK button handler must exist
assert.ok(
  editorSrc.includes("btn-tof-ok"),
  "asc-gen891: btn-tof-ok handler must exist in editor.js",
)

// The OK button must insert the TOC field with data-kind="figures"
assert.ok(
  editorSrc.includes('data-kind="figures"'),
  "asc-gen891: Handler must insert nav with data-kind=figures",
)

// The OK button must use escapeAttr for the title
assert.ok(
  editorSrc.includes("escapeAttr(title") && editorSrc.includes('data-title="'),
  "asc-gen891: Handler must escape the title attribute using escapeAttr",
)

// The OK button must call refreshToc
assert.ok(
  editorSrc.includes("refreshToc()") && editorSrc.includes("btn-tof-ok"),
  "asc-gen891: TOF handler must call refreshToc()",
)

// The close button handler must exist
assert.ok(
  editorSrc.includes("btn-tof-close"),
  "asc-gen891: btn-tof-close handler must exist in editor.js",
)

console.log("All WO-10-asc-gen891 tests passed!\n")
console.log("asc-gen891-PASS")
