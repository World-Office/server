/**
 * AF14-CTX-DEPTH Context Menu Depth Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 *   (a) spellSuggestions exists, samples the dictionary scan, and is wired
 *       into the ctx-menu build step
 *   (b) suggestion rows replace the misspelled word and re-run the check
 *   (c) Text alignment (6 rows) / Text direction (3 rows) submenus exist
 *       and are wired (CSS application functions + dispatcher branches)
 *   (d) data-textdir round-trips: flatHtml() strips no attributes and the
 *       paste sanitizer only drops unsafe ones; wo-textdir-* classes exist
 *   (e) Follow move + AI rows wired (marker event, trackchanges gating,
 *       aiRewrite/aiSummarize/aiTranslate reuse)
 *   (f) i18n for every new row in BOTH en and de
 *   (g) no bare console.log anywhere in editor.js
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/ctx-depth.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `marker not found: ${startMarker}`)
  const end = src.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`)
  return src.slice(start, end)
}

// --- (a) spellSuggestions: exists + sampled loop + called from ctx build ---
const spellSrc = sliceBetween(
  js,
  "function spellSuggestions(word, limit = 5)",
  "function spellReplaceAtSelection",
)
assert.ok(spellSrc.includes("SPELL_SUGGEST_SAMPLE_MAX"), "suggestions must reference the sample ceiling")
assert.ok(
  /for \(let i = 0; i < all\.length; i \+= step\)/.test(spellSrc),
  "suggestions must scan a SAMPLED subset (i += step loop)",
)
assert.ok(spellSrc.includes("spellLevenshtein(w, c, 2)"), "candidates scored by Levenshtein <= 2")

const ctxOpenBlock = sliceBetween(
  js,
  'editorEl.addEventListener("contextmenu"',
  "function toggleFullscreen",
)
assert.ok(
  ctxOpenBlock.includes("refreshSpellSuggestionRows("),
  "ctx menu build step must refresh dynamic suggestion rows",
)
assert.ok(
  ctxOpenBlock.includes("collapseAllCtxSubmenus()"),
  "ctx menu build step must collapse submenus",
)

// --- (b) suggestion rows replace + recheck wiring --------------------------
const dispatcher = sliceBetween(js, 'ctxMenu.addEventListener("click"', "document.addEventListener(\"mousedown\"")
assert.ok(dispatcher.includes('action === "SpellSuggest"'), "dispatcher must handle SpellSuggest rows")
assert.ok(
  dispatcher.includes("spellReplaceAtSelection(btn.dataset.word)"),
  "SpellSuggest rows must replace the misspelled word",
)
const replaceSrc = sliceBetween(js, "function spellReplaceAtSelection", "  // ------")
assert.ok(replaceSrc.includes("runSpellCheck()"), "replacement must re-run the spell check")
const refreshSrc = sliceBetween(js, "function refreshSpellSuggestionRows", "function toggleFullscreen")
assert.ok(refreshSrc.includes("spellSuggestions(word, 5)"), "refresh must request top-5 candidates")
assert.ok(refreshSrc.includes('"SpellSuggest"'), "dynamic rows must carry data-ctx=SpellSuggest")
assert.ok(refreshSrc.includes("data-ctx='Ignore'"), "suggestions must render above the Ignore row")

// --- (c) Text alignment / Text direction submenus ---------------------------
assert.ok(html.includes('data-ctx="TextAlignment"'), "Text alignment submenu header missing")
const alignRows = ["Top", "Middle", "Bottom", "Left", "Center", "Right"]
for (const row of alignRows) {
  const marker = `data-ctx="TextAlign${row}"`
  const idx = html.indexOf(marker)
  assert.notEqual(idx, -1, `Text alignment row missing: ${marker}`)
  const tag = html.slice(idx, idx + 220)
  assert.ok(tag.includes('data-subitem="text-align"'), `${marker} must be a submenu child`)
  assert.ok(tag.includes('data-showif="table"'), `${marker} must be gated on table selection`)
}
assert.ok(html.includes('data-ctx="TextDirection"'), "Text direction submenu header missing")
const dirRows = ["Horizontal", "RotateDown", "RotateUp"]
for (const row of dirRows) {
  const marker = `data-ctx="TextDir${row}"`
  const idx = html.indexOf(marker)
  assert.notEqual(idx, -1, `Text direction row missing: ${marker}`)
  const tag = html.slice(idx, idx + 220)
  assert.ok(tag.includes('data-subitem="text-dir"'), `${marker} must be a submenu child`)
}

for (const action of ["TextAlignment", "TextDirection", ...alignRows.map((r) => `TextAlign${r}`), ...dirRows.map((r) => `TextDir${r}`)]) {
  assert.ok(
    dispatcher.includes(`action === "${action}"`),
    `dispatcher must handle ${action}`,
  )
}
assert.ok(dispatcher.includes('toggleCtxSubmenu(btn, "text-align")'), "alignment header must toggle its submenu")
assert.ok(dispatcher.includes('toggleCtxSubmenu(btn, "text-dir")'), "direction header must toggle its submenu")

const alignApply = sliceBetween(js, "function applyCellVerticalAlign", "// Text direction mirrors")
assert.ok(alignApply.includes("c.style.verticalAlign = va"), "vertical rows must set CSS vertical-align")
assert.ok(alignApply.includes("c.style.textAlign = align"), "horizontal rows must set CSS text-align")
assert.ok(alignApply.includes("tableCellsInSelection()"), "alignment must act on the selected cells")
assert.ok(alignApply.includes("finalizeTableChange()"), "alignment must run the shared dirty chain")

const dirApply = sliceBetween(js, "const TEXT_DIR_MODES", "function collapseAllCtxSubmenus")
assert.ok(dirApply.includes('setProperty("writing-mode"'), "direction must set CSS writing-mode")
assert.ok(dirApply.includes('"vertical-rl"') && dirApply.includes('"sideways-lr"'), "rotate rows must map to real writing modes")
assert.ok(dirApply.includes('setAttribute("data-textdir", mode)'), "direction must persist data-textdir")
assert.ok(dirApply.includes("blocksUnderSelection(sel)"), "direction applies to the block(s) under the selection")

// --- (d) data-textdir survives the save/paste paths (static assert) ---------
const flatSrc = sliceBetween(js, "function flatHtml()", "window.__WO_FLAT_HTML__")
assert.ok(!flatSrc.includes("removeAttribute("), "flatHtml()/save must not strip attributes (data-textdir round-trip)")
const pasteSrc = sliceBetween(js, "function sanitizePasteHtml", "// Rich tracked insert")
assert.ok(pasteSrc.includes("isUnsafePasteAttr(attr.name, attr.value)"), "paste sanitizer strips only unsafe attrs")
assert.ok(!pasteSrc.includes("data-"), "paste sanitizer must not target data-* attributes")
assert.ok(css.includes(".wo-textdir-down") && css.includes(".wo-textdir-up"), "wo-textdir classes must exist in CSS")
assert.ok(css.includes("writing-mode"), "CSS must carry writing-mode for the textdir classes")

// --- (e) Follow move + AI rows ----------------------------------------------
const followIdx = html.indexOf('data-ctx="FollowMove"')
assert.notEqual(followIdx, -1, "Follow move row missing")
assert.ok(
  html.slice(followIdx, followIdx + 200).includes('data-showif="trackchanges"'),
  "Follow move must be gated on track changes",
)
assert.ok(ctxOpenBlock.includes("[data-showif='trackchanges']") && ctxOpenBlock.includes("trackChangesOn"),
  "ctx open must toggle trackchanges-gated rows on trackChangesOn")
assert.ok(dispatcher.includes('action === "FollowMove"'), "dispatcher must handle FollowMove")
assert.ok(dispatcher.includes('"wo:follow-move"'), "Follow move must emit the wo:follow-move marker")

for (const action of ["AI", "AIRewrite", "AISummarize", "AITranslate"]) {
  assert.ok(html.includes(`data-ctx="${action}"`), `${action} row missing`)
  assert.ok(dispatcher.includes(`action === "${action}"`), `dispatcher must handle ${action}`)
}
assert.ok(dispatcher.includes('toggleCtxSubmenu(btn, "ai")'), "AI header must toggle its submenu")
assert.ok(dispatcher.includes('emitCommand("aiRewrite")'), "AI Rewrite must reuse aiRewrite")
assert.ok(dispatcher.includes('emitCommand("aiSummarize")'), "AI Summarize must reuse aiSummarize")
assert.ok(dispatcher.includes('emitCommand("aiTranslate", "German")'), "AI Translate must reuse aiTranslate")

// --- (f) i18n for every new row in en + de -----------------------------------
const NEW_KEYS = [
  "TextAlignment", "TextAlignTop", "TextAlignMiddle", "TextAlignBottom",
  "TextAlignLeft", "TextAlignCenter", "TextAlignRight",
  "TextDirection", "TextDirHorizontal", "TextDirRotateDown", "TextDirRotateUp",
  "FollowMove", "AI", "AIRewrite", "AISummarize", "AITranslate",
]
const deStart = i18n.indexOf("const LOCALE_DE = {")
assert.notEqual(deStart, -1, "LOCALE_DE must exist in i18n.js")
const enSection = i18n.slice(0, deStart)
const deSection = i18n.slice(deStart)
for (const key of NEW_KEYS) {
  assert.ok(enSection.includes(`"Ctx.${key}":`), `Ctx.${key} missing in English i18n`)
  assert.ok(deSection.includes(`"Ctx.${key}":`), `Ctx.${key} missing in German i18n`)
}
for (const row of ["SpellSuggest"]) {
  assert.ok(
    !/<button[^>]*data-ctx="SpellSuggest"/.test(html),
    `${row} rows are dynamic, must not be static HTML buttons`,
  )
}

// --- (g) no bare console.log --------------------------------------------------
assert.equal(js.includes("console.log("), false, "editor.js must not contain bare console.log")
assert.equal(dispatcher.includes("console.log("), false, "ctx dispatcher must not contain bare console.log")

console.log(`(a) spellSuggestions sampled scan wired into ctx build`)
console.log(`(b) suggestion rows replace + recheck wired`)
console.log(`(c) Text alignment (6) / Text direction (3) submenus wired`)
console.log(`(d) data-textdir round-trips save/paste paths`)
console.log(`(e) Follow move + AI rows wired`)
console.log(`(f) ${NEW_KEYS.length} new Ctx.* keys present in en + de`)
console.log(`(g) no bare console.log`)
console.log("CTX-DEPTH-PASS")
