/**
 * RIB-003: contextual ribbon tabs (chart-design, header-footer) auto
 * show/hide. Static pins mirroring chart-design.test.mjs.
 *
 *   (a) both contextual tabs start hidden in the tab strip
 *   (b) chart click reveals + activates; click elsewhere hides (shared
 *       hideChartDesignTab, home fallback when the tab was active)
 *   (c) removal paths without a click (Delete key, Ctrl+X, undo, objectOp
 *       delete) also hide the tab — one childList-only MutationObserver
 *       covers them all; chart rerenders touch attributes only, so the
 *       observer stays quiet while the chart lives
 *   (d) header-footer tab: enter/exit toggles hidden symmetrically
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/contextual-tabs.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")

console.log("Running RIB-003 contextual-tabs tests...\n")

// --- (a) both contextual tabs start hidden ------------------------------
for (const tab of ["chart-design", "header-footer"]) {
  const m = htmlSrc.match(new RegExp(`<button[^>]*class="ribbon-tab contextual"[^>]*data-tab="${tab}"[^>]*>`))
  assert.ok(m, `${tab} ribbon tab must exist with the contextual class`)
  assert.ok(m[0].includes(" hidden"), `${tab} tab must start hidden (shown only on context)`)
}

// --- (b) show on chart click, hide via the shared helper ----------------
assert.ok(editorSrc.includes("function hideChartDesignTab"),
  "editor.js must centralize tab hiding in hideChartDesignTab")
const showBlock = editorSrc.match(/if \(chartDesignTab && chartDesignTab\.hidden\) \{\s*chartDesignTab\.hidden = false;[^}]*chartDesignTab\.click\(\);/)
assert.ok(showBlock, "clicking a chart must reveal AND activate the chart-design tab")
assert.ok(editorSrc.includes("hideChartDesignTab();"),
  "the click-elsewhere path must reuse hideChartDesignTab")
assert.ok(/function hideChartDesignTab[\s\S]*?data-tab="home"/.test(editorSrc),
  "hiding an active chart-design tab must fall back to the Home tab")

// --- (c) removal without a click hides the tab ---------------------------
const obs = editorSrc.match(/new MutationObserver\(\(\) => \{\s*if \(!chartDesignTab\.hidden && !selectedChart\(\)\) hideChartDesignTab\(\);\s*\}\)\.observe\(editor, \{ childList: true, subtree: true \}\)/)
assert.ok(obs, "a childList MutationObserver must auto-hide the tab when the chart is removed")

// --- (d) header-footer symmetric toggling --------------------------------
assert.ok(editorSrc.includes("function enterHFMode"), "enterHFMode must exist")
assert.ok(editorSrc.includes("function exitHFMode"), "exitHFMode must exist")
assert.ok(/function enterHFMode[\s\S]{0,400}hfTab\.hidden = false/.test(editorSrc),
  "entering header/footer mode must unhide the tab")
assert.ok(/function exitHFMode[\s\S]{0,500}hfTab\.hidden = true/.test(editorSrc),
  "exiting header/footer mode must re-hide the tab")

console.log("\nAll RIB-003 contextual-tabs tests passed!")
