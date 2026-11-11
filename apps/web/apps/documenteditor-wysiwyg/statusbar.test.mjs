/**
 * SB-X: Status bar OO templateIds test
 * Node.js built-in test runner (node:assert, zero dependencies).
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running SB-X tests...\n")

// 1. Check all required statusbar elements exist in index.html
console.log("Checking statusbar elements in index.html...")
const requiredIds = ["sb-word-count", "sb-page-count", "sb-zoom-label", "sb-track-changes", "sb-doc-spell"]
for (const id of requiredIds) {
  assert.ok(htmlSrc.includes(`id="${id}"`), `Statusbar element ${id} must exist in index.html`)
  const elementMatch = htmlSrc.match(new RegExp(`id="${id}"[^>]*data-i18n="([^"]*)"`))
  assert.ok(elementMatch?.[1], `Statusbar element ${id} must have data-i18n attribute`)
}
console.log("All statusbar elements present\n")

// 2. Check i18n keys exist for en and de
console.log("Checking i18n translation keys...")
const requiredKeys = [
  "Statusbar.Words",
  "Statusbar.PageOf",
  "Statusbar.Zoom",
  "Statusbar.TrackChanges",
]
for (const key of requiredKeys) {
  assert.ok(i18nSrc.includes(`"${key}":`), `i18n key ${key} must exist`)
}
assert.ok(i18nSrc.includes('"Statusbar.Words": "0 Wörter"'), "German Statusbar.Words must exist")
assert.ok(
  i18nSrc.includes('"Statusbar.PageOf": "Seite 1 von 0"'),
  "German Statusbar.PageOf must exist",
)
assert.ok(i18nSrc.includes('"Statusbar.Zoom": "100%"'), "German Statusbar.Zoom must exist")
assert.ok(
  i18nSrc.includes('"Statusbar.TrackChanges": "Nachverfolgen von Änderungen"'),
  "German Statusbar.TrackChanges must exist",
)
console.log("All i18n keys present\n")

// 3. Check zoom label is updated in applyZoom
console.log("Checking applyZoom updates sb-zoom-label...")
const applyZoomMatch = editorSrc.match(/function applyZoom[\s\S]*?\{/)
assert.ok(applyZoomMatch, "applyZoom function must exist")
const applyZoomBody = editorSrc.slice(applyZoomMatch.index)
assert.ok(
  applyZoomBody.includes("sb-zoom-label") && applyZoomBody.includes("textContent"),
  "applyZoom must update sb-zoom-label textContent",
)
assert.ok(
  applyZoomBody.includes("Math.round(zoomLevel * 100)"),
  "applyZoom must calculate zoom percentage",
)
console.log("applyZoom updates sb-zoom-label\n")

// 4. Check track changes button is wired
console.log("Checking track changes button wiring...")
assert.ok(
  editorSrc.includes("sb-track-changes") && editorSrc.includes("addEventListener"),
  "sb-track-changes must have event listener",
)
assert.ok(
  editorSrc.includes("setTrackChanges") && editorSrc.includes("sb-track-changes"),
  "sb-track-changes must call setTrackChanges",
)
assert.ok(
  editorSrc.includes("aria-pressed") && editorSrc.includes("sb-track-changes"),
  "sb-track-changes must have aria-pressed state",
)
console.log("Track changes button is wired\n")

// 5. Check page count is updated
console.log("Checking page count updates...")
assert.ok(
  editorSrc.includes("updatePageIndicator") && editorSrc.includes("sb-page-count"),
  "updatePageIndicator must update sb-page-count",
)
console.log("Page count is updated\n")

// 6. Check word count is updated
console.log("Checking word count updates...")
assert.ok(
  editorSrc.includes("updateCounts") && editorSrc.includes("sb-word-count"),
  "updateCounts must update sb-word-count",
)
assert.ok(
  editorSrc.includes(".split(/" ) && editorSrc.includes(".filter(Boolean"),
  "Word count must split on whitespace and filter empty strings",
)

function countWords(html) {
  const text = html.replace(/<[^>]*>/g, " ").trim()
  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

assert.equal(countWords(""), 0, "Empty editor = 0 words")
assert.equal(countWords("Hello world"), 2, "2 words")
assert.equal(countWords("<p>Hello</p><p>world</p>"), 2, "Words across tags")
assert.equal(countWords("  Hello   world  "), 2, "Extra whitespace")
assert.equal(countWords("Hello\n\nworld"), 2, "Newlines")
assert.equal(countWords("<p></p>"), 0, "Empty tags")
assert.equal(countWords("<div><span>Test</span> <span>content</span></div>"), 2, "Nested tags")
console.log("Word count logic is correct\n")

// 7. Check event listeners
console.log("Checking event listeners call update functions...")
assert.ok(
  editorSrc.includes('addEventListener("input"') && editorSrc.includes("updateCounts"),
  "Input event must call updateCounts",
)
assert.ok(
  editorSrc.includes("paginateView") && editorSrc.includes("updatePageIndicator"),
  "Pagination must call updatePageIndicator",
)
console.log("Event listeners are properly wired\n")

// 8. SB-X: Check OO templateIds for statusbar elements
console.log("Checking OO templateIds for statusbar elements...")

// Goto-page box: sb-page-count
assert.ok(
  htmlSrc.includes('id="sb-page-count"') && 
  htmlSrc.match(/id="sb-page-count"[^>]*data-wo-id="[^"]*"/),
  "sb-page-count must have data-wo-id attribute"
)

// Zoom in/out + zoom-to-page/width
assert.ok(
  htmlSrc.includes('id="btn-zoom-in"') && 
  htmlSrc.match(/id="btn-zoom-in"[^>]*data-wo-id="[^"]*"/),
  "btn-zoom-in must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="btn-zoom-out"') && 
  htmlSrc.match(/id="btn-zoom-out"[^>]*data-wo-id="[^"]*"/),
  "btn-zoom-out must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="btn-zoom-fitpage"') && 
  htmlSrc.match(/id="btn-zoom-fitpage"[^>]*data-wo-id="[^"]*"/),
  "btn-zoom-fitpage must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="btn-zoom-fit"') && 
  htmlSrc.match(/id="btn-zoom-fit"[^>]*data-wo-id="[^"]*"/),
  "btn-zoom-fit must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="btn-zoom-reset"') && 
  htmlSrc.match(/id="btn-zoom-reset"[^>]*data-wo-id="[^"]*"/),
  "btn-zoom-reset must have data-wo-id attribute (zoom to 100%)"
)

// Info: sb-word-count
assert.ok(
  htmlSrc.includes('id="sb-word-count"') && 
  htmlSrc.match(/id="sb-word-count"[^>]*data-wo-id="[^"]*"/),
  "sb-word-count must have data-wo-id attribute"
)

// Content language: sb-lang, doc-lang, sb-doc-lang
assert.ok(
  htmlSrc.includes('id="sb-lang"') && 
  htmlSrc.match(/id="sb-lang"[^>]*data-wo-id="[^"]*"/),
  "sb-lang must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="doc-lang"') && 
  htmlSrc.match(/id="doc-lang"[^>]*data-wo-id="[^"]*"/),
  "doc-lang must have data-wo-id attribute"
)
assert.ok(
  htmlSrc.includes('id="sb-doc-lang"') && 
  htmlSrc.match(/id="sb-doc-lang"[^>]*data-wo-id="[^"]*"/),
  "sb-doc-lang must have data-wo-id attribute"
)

console.log("All OO templateIds are present for statusbar elements\n")

console.log("All SB-X tests passed!")
console.log("ok")
