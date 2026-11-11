/**
 * CHROME-G: Review display-mode dropdown test
 * Verifies that the display-mode dropdown 'Alle Änderungen anzeigen' is properly
 * implemented next to the track-changes statusbar icon (OO 9.4 statusbar).
 * 
 * This test checks for a select dropdown with id "sb-review-display-mode" that
 * controls how track changes are displayed (simple/final/review/etc).
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const stylePath = new URL("./style.css", import.meta.url)

const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const styleSrc = readFileSync(stylePath, "utf-8")

console.log("Running CHROME-G review display-mode dropdown tests...\n")

// 1. Check that the display-mode dropdown element exists next to sb-track-changes
console.log("1. Checking display-mode dropdown element...")
assert.ok(
  htmlSrc.includes('id="sb-review-display-mode"'),
  "Display mode dropdown must have id 'sb-review-display-mode'"
)
assert.ok(
  htmlSrc.match(/id="sb-review-display-mode"[^>]*data-i18n="Statusbar\.DisplayMode"/),
  "Display mode dropdown must have i18n key 'Statusbar.DisplayMode'"
)
console.log("   ✓ Display mode dropdown element exists with correct id and i18n\n")

// 2. Check i18n keys for 'Alle Änderungen anzeigen'
console.log("2. Checking i18n keys...")
assert.ok(
  i18nSrc.includes('"Statusbar.DisplayMode": "Show All Changes"'),
  "English i18n must have 'Statusbar.DisplayMode'"
)
assert.ok(
  i18nSrc.includes('"Statusbar.DisplayMode": "Alle Änderungen anzeigen"'),
  "German i18n must have 'Statusbar.DisplayMode' with value 'Alle Änderungen anzeigen'"
)
console.log("   ✓ i18n keys are correct\n")

// 3. Check that dropdown is a select element with mode options
console.log("3. Checking dropdown is a select with mode options...")
const dropdownMatch = htmlSrc.match(/<select id="sb-review-display-mode"[^>]*>[\s\S]*?<\/select>/)
assert.ok(dropdownMatch, "Dropdown must be a select element")
const dropdownHtml = dropdownMatch[0]
// Should have options like: simple, final, review, original
const options = [...dropdownHtml.matchAll(/<option value="([^"]+)"/g)].map(m => m[1])
assert.ok(options.length >= 2, "Dropdown must have at least 2 options")
assert.ok(
  options.some(opt => opt === "review" || opt === "all" || opt.includes("markup")),
  "Dropdown must have a review/all markup option"
)
console.log("   ✓ Dropdown is a select with mode options\n")

// 4. Check that the dropdown is positioned next to sb-track-changes in the statusbar
console.log("4. Checking position in statusbar...")
const sbTrackPos = htmlSrc.indexOf('id="sb-track-changes"')
const sbReviewPos = htmlSrc.indexOf('id="sb-review-display-mode"')
assert.ok(sbTrackPos > 0 && sbReviewPos > 0, "Both elements must exist")
// Check they appear in the correct order (track-changes first, then review display mode)
assert.ok(
  sbReviewPos > sbTrackPos,
  "sb-review-display-mode must appear after sb-track-changes"
)
// Check they're in the same statusbar section (within a reasonable distance)
const distance = sbReviewPos - sbTrackPos
assert.ok(distance < 500, `Dropdown must be near track-changes button (distance: ${distance})`)
// Verify both are in the footer#statusbar
const footerStart = htmlSrc.indexOf('<footer id="statusbar"')
const footerEnd = htmlSrc.indexOf('</footer>', footerStart)
assert.ok(
  sbTrackPos > footerStart && sbTrackPos < footerEnd &&
  sbReviewPos > footerStart && sbReviewPos < footerEnd,
  "Both elements must be inside the statusbar footer"
)
console.log("   ✓ Dropdown is positioned next to track-changes button in statusbar\n")

// 5. Check that editor.js has handler for the dropdown change event
console.log("5. Checking editor.js event handler...")
assert.ok(
  editorSrc.includes("sb-review-display-mode") && editorSrc.includes("addEventListener"),
  "editor.js must have event listener for sb-review-display-mode"
)
assert.ok(
  editorSrc.includes("setReviewDisplayMode") || editorSrc.includes("changeReviewDisplayMode"),
  "editor.js must have function to handle display mode change"
)
console.log("   ✓ Event handler exists\n")

// 6. Check styling in style.css for the dropdown
console.log("6. Checking styling...")
assert.ok(
  styleSrc.includes("sb-review-display-mode"),
  "style.css must have styling for sb-review-display-mode"
)
console.log("   ✓ Styling exists\n")

// 7. Check the select element has proper accessibility attributes
console.log("7. Checking accessibility attributes...")
assert.ok(
  dropdownHtml.includes('aria-label') || htmlSrc.includes('id="sb-review-display-mode"') && htmlSrc.includes('aria-labelledby'),
  "Dropdown must have aria-label or aria-labelledby"
)
console.log("   ✓ Accessibility attributes present\n")

console.log("All CHROME-G review display-mode dropdown tests passed!")
console.log("\nREVIEW-MODE-PASS")
