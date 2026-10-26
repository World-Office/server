/**
 * BUG1-STATIC-AUDIT gate: static wiring audit.
 *
 * Four zero-dep checks over the real sources:
 *   1. i18n parity — every key referenced by index.html (data-i18n*) or
 *      editor.js (literal t("Key")) exists in BOTH en and de catalogs
 *      (loads the real catalogs via scripts/audit-i18n.mjs, no regex parsing
 *      of i18n.js).
 *   2. Dead wiring — every getElementById("X") in editor.js must target an
 *      id that exists in index.html or is created dynamically in editor.js.
 *   3. Dialog registry — every .dialog-overlay in index.html is registered
 *      in DIALOG_IDS (modal Tab trap), every registered id exists, the
 *      global Esc close is wired, and DIALOG_CLOSE routes to defined
 *      functions.
 *   4. aria-keyshortcuts — every shortcut declared in index.html is handled
 *      in editor.js or is documented browser-native (clipboard + select-all
 *      inside contenteditable).
 *
 * Run with: node audit-i18n.test.mjs
 * Success: prints "STATIC-AUDIT-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { collectMissing, auditStats } from "./scripts/audit-i18n.mjs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")

// --- 1. i18n parity -------------------------------------------------------
const stats = auditStats()
assert.ok(stats.enKeys > 0, "en catalog must not be empty")
assert.ok(stats.deKeys > 0, "de catalog must not be empty")

const missing = collectMissing()
assert.deepEqual(
  missing,
  [],
  `missing i18n keys (key/catalog): ${JSON.stringify(missing)}`
)

// --- 2. Dead wiring -------------------------------------------------------
const htmlIds = new Set([...htmlSrc.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
const jsCreatedIds = new Set([
  ...[...editorSrc.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
  ...[...editorSrc.matchAll(/\.id\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
])
const wantedIds = new Set(
  [...editorSrc.matchAll(/getElementById\((["'])((?:(?!\1).)*)\1\)/g)].map((m) => m[2])
)
const deadIds = [...wantedIds].filter(
  (id) => !htmlIds.has(id) && !jsCreatedIds.has(id)
)
assert.deepEqual(
  deadIds,
  [],
  `dead getElementById wiring (ids missing from index.html and not created in editor.js): ${JSON.stringify(deadIds)}`
)

// --- 3. Dialog registry ---------------------------------------------------
// Every .dialog-overlay element id in the HTML. Overlays that declare
// aria-modal="false" (e.g. #objlayout-pop, which combines .insert-pop with
// .dialog-overlay purely for styling) are explicitly non-modal popovers and
// are exempt from the modal registry.
const overlayTags = [...htmlSrc.matchAll(/<div[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => tag.includes("dialog-overlay"))
const overlayIds = new Set(
  overlayTags
    .filter((tag) => !tag.includes('aria-modal="false"'))
    .map((tag) => (tag.match(/id="([^"]+)"/) || [])[1])
    .filter(Boolean)
)
const nonModalPops = overlayTags
  .filter((tag) => tag.includes('aria-modal="false"'))
  .map((tag) => (tag.match(/id="([^"]+)"/) || [])[1])
  .filter(Boolean)
// …must be registered in DIALOG_IDS (modal Tab trap + global Esc close).
const dialogIdsMatch = editorSrc.match(/const DIALOG_IDS = \[([^\]]*)\]/)
assert.ok(dialogIdsMatch, "DIALOG_IDS must be defined in editor.js")
const dialogIds = new Set(
  [...dialogIdsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
)
for (const id of nonModalPops) {
  assert.ok(
    !dialogIds.has(id),
    `aria-modal="false" popover "${id}" must NOT be in DIALOG_IDS (modal Tab trap would break it)`
  )
}
const unregistered = [...overlayIds].filter((id) => !dialogIds.has(id))
assert.deepEqual(
  unregistered,
  [],
  `modal .dialog-overlay elements missing from DIALOG_IDS: ${JSON.stringify(unregistered)}`
)
const phantom = [...dialogIds].filter((id) => !htmlIds.has(id))
assert.deepEqual(
  phantom,
  [],
  `DIALOG_IDS entries without matching element in index.html: ${JSON.stringify(phantom)}`
)
// Global Esc close must route through getOpenDialog() with a close map…
assert.ok(
  /addEventListener\("keydown", \(ev\) => \{\s*\n\s*if \(ev\.key !== "Escape"\) return;\s*\n\s*const dialog = getOpenDialog\(\);/.test(editorSrc),
  "global Esc keydown handler closing getOpenDialog() must exist"
)
const closeMapMatch = editorSrc.match(/const DIALOG_CLOSE = \{([^}]*)\}/)
assert.ok(closeMapMatch, "DIALOG_CLOSE close-path map must exist")
for (const id of [...closeMapMatch[1].matchAll(/"([^"]+)":/g)].map((m) => m[1])) {
  assert.ok(
    dialogIds.has(id),
    `DIALOG_CLOSE route "${id}" must be a registered DIALOG_IDS entry`
  )
  const fn = (closeMapMatch[1].match(new RegExp(`"${id}":\\s*([A-Za-z0-9_$]+)`)) || [])[1]
  assert.match(
    editorSrc,
    new RegExp(`function ${fn}\\(`),
    `DIALOG_CLOSE route "${id}" must point at a defined close function`
  )
}

// --- 4. aria-keyshortcuts -------------------------------------------------
// Shortcuts the browser already handles inside contenteditable: clipboard
// and select-all. Declaring them is accurate; custom handlers would break
// native clipboard/paste-sanitize behaviour.
const NATIVE_SHORTCUTS = new Set(["Control+C", "Control+X", "Control+V", "Control+A"])
// Everything else must have explicit handling in editor.js. Map each
// declared shortcut to the source token that implements it — a refactor
// that moves a handler must move it under the same key match.
const SHORTCUT_HANDLING = {
  "Control+S": 'k === "s"',
  "Control+Z": 'k === "z"',
  "Control+Y": 'k === "y"',
  "Control+Shift+Z": 'k === "z"',
  "Control+[": 'BracketLeft',
  "Control+]": 'BracketRight',
  "Control+B": 'k === "b"',
  "Control+I": 'k === "i"',
  "Control+U": 'k === "u"',
  "Control+.": 'k === "."',
  "Control+Shift+7": 'Digit7',
  "Control+Shift+8": 'Digit8',
  "Control+Shift+L": 'k === "l"',
  "Control+E": 'k === "e"',
  "Control+R": 'k === "r"',
  "Control+J": 'k === "j"',
  "Control+F": '=== "f"',
  "Control+H": 'k === "h"',
  "Control+Minus": '"Minus"',
  "Control+Plus": '"Equal"',
}
const declared = new Set(
  [...htmlSrc.matchAll(/aria-keyshortcuts="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
)
const unhandled = [...declared].filter(
  (sc) =>
    !NATIVE_SHORTCUTS.has(sc) &&
    !(SHORTCUT_HANDLING[sc] && editorSrc.includes(SHORTCUT_HANDLING[sc]))
)
assert.deepEqual(
  unhandled,
  [],
  `aria-keyshortcuts declared in index.html but not handled in editor.js (extend SHORTCUT_HANDLING or wire the handler): ${JSON.stringify(unhandled)}`
)

// --- 5. Buttons with visible text/title must carry data-i18n ---------------
// Font names are product names and font sizes are numerals — untranslated by
// convention. Pure-glyph buttons (▾ carets) have no translatable text.
const FONT_NAMES = new Set(["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana"])
const buttons = [...htmlSrc.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0])
const unlabeled = buttons
  .filter((b) => !/data-i18n/.test(b))
  .map((b) => ({
    title: (b.match(/title="([^"]*)"/) || [])[1] || "",
    text: b.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  }))
  .filter(
    ({ title, text }) =>
      title ||
      (text && !/^[0-9]+$/.test(text) && !FONT_NAMES.has(text) && !/^[^a-zA-Z0-9]+$/.test(text))
  )
assert.deepEqual(
  unlabeled,
  [],
  `buttons with visible text/title but no data-i18n attribute: ${JSON.stringify(unlabeled)}`
)

console.log(`STATIC-AUDIT-PASS (${stats.referencedKeys} i18n keys in en+de, ${dialogIds.size} dialogs registered, ${declared.size} keyshortcuts verified, ${buttons.length} buttons labeled)`)
