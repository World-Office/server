/**
 * AF9-CHART-DESIGN: Chart design tab OO parity tests
 * Node.js zero-dependency static analysis (mirrors layout-objectops.test.mjs).
 *
 *   (a) chart-design ribbon tab + page exist with the 8 control groups
 *   (b) every data-cmd in the tab is dispatched in editor.js runCommand
 *   (c) chartSVG honors spec.elements flags (title/legend/gridlines/dataLabels)
 *   (d) every data-i18n key exists in BOTH en and de
 *   (e) marker ops fire wo: events, selection wiring + aria-disabled state,
 *       and no bare console.log stubs
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/chart-design.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running AF9-CHART-DESIGN tests...\n")

// --- (a) tab + page with 8 control groups ------------------------------
const tabMatch = htmlSrc.match(/<button[^>]*class="ribbon-tab"[^>]*data-tab="chart-design"[^>]*>/)
assert.ok(tabMatch, "chart-design ribbon tab button must exist in index.html")
assert.ok(tabMatch[0].includes('data-i18n="Tab.ChartDesign"'), "tab button must use the Tab.ChartDesign i18n key")

const pageStart = htmlSrc.indexOf('<div class="ribbon-page" data-tab="chart-design"')
assert.notEqual(pageStart, -1, "chart-design ribbon page must exist in index.html")
const pageEnd = htmlSrc.indexOf('<div class="ribbon-page" data-tab="header-footer"', pageStart)
assert.notEqual(pageEnd, -1, "header-footer page must follow the chart-design page")
const pageHtml = htmlSrc.slice(pageStart, pageEnd)

const groups = [...pageHtml.matchAll(/<div class="rb-group" role="group" aria-label="([^"]+)"/g)].map((m) => m[1])
console.log(`Control groups: ${groups.join(", ")}`)
assert.equal(groups.length, 8, `page must have exactly 8 control groups, got ${groups.length}`)
for (const label of [
  "Chart type", "Edit chart data", "Update chart data", "Chart elements",
  "Chart settings", "Chart wrapping", "Chart size", "Chart 3D rotation",
]) {
  assert.ok(groups.includes(label), `control group "${label}" must exist`)
}

const typeValues = [...pageHtml.matchAll(/data-cmd="chartType" data-value="([^"]+)"/g)].map((m) => m[1])
console.log(`Chart types: ${typeValues.join(", ")}`)
assert.deepEqual(typeValues.sort(), ["area", "bar", "line", "pie"],
  "Chart type menu must offer exactly the chartSVG types (bar/line/pie/area)")

const elementValues = [...pageHtml.matchAll(/data-cmd="chartElement" data-value="([^"]+)"/g)].map((m) => m[1])
for (const flag of ["title", "legend", "gridlines", "dataLabels"]) {
  assert.ok(elementValues.includes(flag), `Chart elements menu must have a "${flag}" toggle`)
}
assert.ok(pageHtml.includes('data-cmd="chartEditData"'), "Edit data control must exist")
assert.ok(pageHtml.includes('data-cmd="chartUpdateData"'), "Update data control must exist")
assert.ok(pageHtml.includes('data-cmd="chartSettings"'), "Advanced settings control must exist")
assert.ok(pageHtml.includes('data-cmd="chart3d"'), "3D rotation control must exist")
assert.ok(pageHtml.includes('id="chart-width-input"'), "Width input must exist")
assert.ok(pageHtml.includes('id="chart-height-input"'), "Height input must exist")
assert.ok(pageHtml.includes('data-cmd="chartSize"'), "Apply size control must exist")
for (const v of ["wrap-inline", "wrap-square", "wrap-behind"]) {
  assert.ok(pageHtml.includes(`data-cmd="objectOp" data-value="${v}"`),
    `Wrapping menu must reuse the AF4 objectOp value "${v}"`)
}

// --- (b) every data-cmd in the tab is dispatched in editor.js ----------
function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  return src.slice(start, i + 1)
}
const runCommandBody = extractFunction(editorSrc, "runCommand")
const cmds = [...new Set([...pageHtml.matchAll(/data-cmd="([^"]+)"/g)].map((m) => m[1]))]
console.log(`Tab data-cmd values: ${cmds.join(", ")}`)
for (const cmd of cmds) {
  assert.ok(runCommandBody.includes(`cmd === "${cmd}"`),
    `data-cmd="${cmd}" must be dispatched in the editor.js runCommand dispatcher`)
}

// --- (c) chartSVG honors spec.elements flags ----------------------------
const chartSvgBody = extractFunction(editorSrc, "chartSVG")
for (const flag of ["legend", "title", "gridlines", "dataLabels"]) {
  assert.ok(chartSvgBody.includes(`els.${flag}`),
    `chartSVG must read the spec.elements.${flag} flag`)
}
assert.ok(chartSvgBody.includes("showLegend") && chartSvgBody.includes("showGrid"),
  "chartSVG must render legend/gridlines from the flags")
const rerenderBody = extractFunction(editorSrc, "rerenderChart")
assert.ok(rerenderBody.includes("spec.elements"),
  "rerenderChart must pass spec.elements to chartSVG")
assert.ok(rerenderBody.includes("reloadVectorTarget"),
  "rerenderChart must re-render via reloadVectorTarget")

// --- (d) every data-i18n key exists in en AND de ------------------------
function extractLocaleSection(src, constName) {
  const start = src.indexOf(`const ${constName} = {`)
  assert.notEqual(start, -1, `${constName} must exist in i18n.js`)
  let depth = 0
  let end = start
  let opened = false
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") { depth++; opened = true }
    else if (src[i] === "}") {
      depth--
      if (opened && depth === 0) { end = i; break }
    }
  }
  return src.slice(start, end + 1)
}
const deSection = extractLocaleSection(i18nSrc, "LOCALE_DE")
const keys = [...new Set([
  ...[...htmlSrc.matchAll(/data-i18n="(Tab\.ChartDesign|Chart\.[A-Za-z.]+)"/g)].map((m) => m[1]),
  ...[...pageHtml.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
])]
console.log(`i18n keys: ${keys.join(", ")}`)
for (const key of keys) {
  assert.ok(new RegExp(`"${key}":`).test(i18nSrc), `i18n key "${key}" must exist (en)`)
  assert.ok(new RegExp(`"${key}":`).test(deSection), `i18n key "${key}" must exist (de)`)
}

// --- (e) markers, selection wiring, aria-disabled, no console.log stubs --
assert.ok(editorSrc.includes('"wo:chart-settings"'),
  "Advanced settings must fire the wo:chart-settings marker event")
assert.ok(editorSrc.includes('"wo:chart-3d"'),
  "3D rotation must fire the wo:chart-3d marker event")
assert.ok(editorSrc.includes("function selectedChart"),
  "editor.js must track the selected chart (selectedChart)")
assert.ok(editorSrc.includes("img.vector-object[data-kind='chart']"),
  "selection wiring must resolve img[data-kind='chart'] vector objects")
assert.ok(editorSrc.includes("aria-disabled"),
  "controls must be visibly disabled via aria-disabled with no chart selected")
assert.ok(editorSrc.includes("function applyChartSize"),
  "editor.js must implement chart size application")
assert.ok(editorSrc.includes("function applyChartType"),
  "editor.js must implement chart type application")
assert.ok(editorSrc.includes("function toggleChartElement"),
  "editor.js must implement chart element toggles")
assert.ok(editorSrc.includes("function editSelectedChartData"),
  "editor.js must open the chart editor for the selected chart")
assert.ok(editorSrc.includes("function updateSelectedChartData"),
  "editor.js must re-render the selected chart from its spec")
assert.ok(editorSrc.includes("function updateChartDesignState"),
  "editor.js must refresh tab operability on selection changes")
assert.ok(!editorSrc.includes("console.log("),
  "editor.js must not contain bare console.log stubs")

console.log("\nAll AF9-CHART-DESIGN tests passed!")
