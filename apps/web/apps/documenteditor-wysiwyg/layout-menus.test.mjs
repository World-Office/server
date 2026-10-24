/**
 * AF2-LAYOUT-MENUS: Layout tab preset dropdown menus tests
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

console.log("Running AF2-LAYOUT-MENUS tests...\n")

// Verify PS_SIZES constant exists with expected values
assert.ok(editorSrc.includes("A4: [11906, 16838]"), "PS_SIZES must include A4 [11906, 16838]")
assert.ok(
  editorSrc.includes("Letter: [12240, 15840]"),
  "PS_SIZES must include Letter [12240, 15840]",
)
assert.ok(editorSrc.includes("Legal: [12240, 20160]"), "PS_SIZES must include Legal [12240, 20160]")
assert.ok(editorSrc.includes("A5: [8391, 11906]"), "PS_SIZES must include A5 [8391, 11906]")

// Verify PS_MARGIN_PRESETS constant exists with expected values
assert.ok(
  editorSrc.includes("PS_MARGIN_PRESETS"),
  "PS_MARGIN_PRESETS constant must exist in editor.js",
)
assert.ok(editorSrc.includes("moderate:"), "PS_MARGIN_PRESETS must include moderate preset")
assert.ok(editorSrc.includes("1080"), "PS_MARGIN_PRESETS must include 1080 value")
assert.ok(editorSrc.includes("2880"), "PS_MARGIN_PRESETS must include 2880 value")
assert.ok(editorSrc.includes("720"), "PS_MARGIN_PRESETS must include 720 value")

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

// Extract writePageSetupMarker to verify it exists
const writeMarkerFunc = extractFunction(editorSrc, "writePageSetupMarker")
assert.ok(writeMarkerFunc, "writePageSetupMarker function must exist in editor.js")
assert.ok(
  writeMarkerFunc.includes("applyPageView()"),
  "writePageSetupMarker must call applyPageView()",
)
assert.ok(writeMarkerFunc.includes("markDirty()"), "writePageSetupMarker must call markDirty()")

// Extract the preset handler functions
const applyMarginsFunc = extractFunction(editorSrc, "applyPageMarginsPreset")
const applySizeFunc = extractFunction(editorSrc, "applyPageSizePreset")
const applyOrientFunc = extractFunction(editorSrc, "applyPageOrientationPreset")

assert.ok(applyMarginsFunc, "applyPageMarginsPreset function must exist in editor.js")
assert.ok(applySizeFunc, "applyPageSizePreset function must exist in editor.js")
assert.ok(applyOrientFunc, "applyPageOrientationPreset function must exist in editor.js")

// Verify all three preset handlers call writePageSetupMarker
assert.ok(
  applyMarginsFunc.includes("writePageSetupMarker"),
  "applyPageMarginsPreset must call writePageSetupMarker",
)
assert.ok(
  applySizeFunc.includes("writePageSetupMarker"),
  "applyPageSizePreset must call writePageSetupMarker",
)
assert.ok(
  applyOrientFunc.includes("writePageSetupMarker"),
  "applyPageOrientationPreset must call writePageSetupMarker",
)

// Extract the layout ribbon tab
const layoutTabMatch = htmlSrc.match(/<div class="ribbon-page" data-tab="layout"[^>]*>.*?<\/div>/s)
assert.ok(layoutTabMatch, "Layout ribbon tab must exist in index.html")
const layoutTabHtml = layoutTabMatch[0]

// Count menu-triggers and role=menu lists in layout tab
const triggers = (layoutTabHtml.match(/menu-trigger/g) || []).length
const menus = (layoutTabHtml.match(/role="menu"/g) || []).length
console.log(`Layout tab menu-triggers: ${triggers}, role=menu lists: ${menus}`)
assert.ok(triggers >= 3, `Need >=3 menu-triggers in layout tab, got ${triggers}`)
assert.ok(menus >= 3, `Need >=3 role=menu lists in layout tab, got ${menus}`)

// Verify the three specific menu triggers exist with correct data-i18n
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Margins"'),
  "Layout tab must contain Margins menu trigger",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Size"'),
  "Layout tab must contain Size menu trigger",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Orientation"'),
  "Layout tab must contain Orientation menu trigger",
)

// Verify menu items exist with correct data-cmd and data-value
assert.ok(
  layoutTabHtml.includes('data-cmd="applyPageMargins"'),
  "Layout tab must contain applyPageMargins command",
)
assert.ok(layoutTabHtml.includes('data-value="normal"'), "Margins menu must have Normal preset")
assert.ok(layoutTabHtml.includes('data-value="narrow"'), "Margins menu must have Narrow preset")
assert.ok(layoutTabHtml.includes('data-value="moderate"'), "Margins menu must have Moderate preset")
assert.ok(layoutTabHtml.includes('data-value="wide"'), "Margins menu must have Wide preset")

assert.ok(
  layoutTabHtml.includes('data-cmd="applyPageSize"'),
  "Layout tab must contain applyPageSize command",
)
assert.ok(layoutTabHtml.includes('data-value="A4"'), "Size menu must have A4 preset")
assert.ok(layoutTabHtml.includes('data-value="Letter"'), "Size menu must have Letter preset")
assert.ok(layoutTabHtml.includes('data-value="Legal"'), "Size menu must have Legal preset")
assert.ok(layoutTabHtml.includes('data-value="A5"'), "Size menu must have A5 preset")

assert.ok(
  layoutTabHtml.includes('data-cmd="applyPageOrientation"'),
  "Layout tab must contain applyPageOrientation command",
)
assert.ok(
  layoutTabHtml.includes('data-value="portrait"'),
  "Orientation menu must have Portrait preset",
)
assert.ok(
  layoutTabHtml.includes('data-value="landscape"'),
  "Orientation menu must have Landscape preset",
)

// Verify menu items have correct i18n labels
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Margins.Normal"'),
  "Margins Normal must have i18n label",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Margins.Narrow"'),
  "Margins Narrow must have i18n label",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Margins.Moderate"'),
  "Margins Moderate must have i18n label",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Margins.Wide"'),
  "Margins Wide must have i18n label",
)

assert.ok(layoutTabHtml.includes('data-i18n="Layout.Size.A4"'), "Size A4 must have i18n label")
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Size.Letter"'),
  "Size Letter must have i18n label",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Size.Legal"'),
  "Size Legal must have i18n label",
)
assert.ok(layoutTabHtml.includes('data-i18n="Layout.Size.A5"'), "Size A5 must have i18n label")

assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Orientation.Portrait"'),
  "Orientation Portrait must have i18n label",
)
assert.ok(
  layoutTabHtml.includes('data-i18n="Layout.Orientation.Landscape"'),
  "Orientation Landscape must have i18n label",
)

// Verify English translations exist
assert.ok(i18nSrc.includes('"Layout.Margins": "Margins"'), "i18n must contain Layout.Margins")
assert.ok(
  i18nSrc.includes('"Layout.Margins.Normal": "Normal"'),
  "i18n must contain Layout.Margins.Normal",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Narrow": "Narrow"'),
  "i18n must contain Layout.Margins.Narrow",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Moderate": "Moderate"'),
  "i18n must contain Layout.Margins.Moderate",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Wide": "Wide"'),
  "i18n must contain Layout.Margins.Wide",
)
assert.ok(i18nSrc.includes('"Layout.Size": "Size"'), "i18n must contain Layout.Size")
assert.ok(i18nSrc.includes('"Layout.Size.A4": "A4"'), "i18n must contain Layout.Size.A4")
assert.ok(
  i18nSrc.includes('"Layout.Size.Letter": "Letter"'),
  "i18n must contain Layout.Size.Letter",
)
assert.ok(i18nSrc.includes('"Layout.Size.Legal": "Legal"'), "i18n must contain Layout.Size.Legal")
assert.ok(i18nSrc.includes('"Layout.Size.A5": "A5"'), "i18n must contain Layout.Size.A5")
assert.ok(
  i18nSrc.includes('"Layout.Orientation": "Orientation"'),
  "i18n must contain Layout.Orientation",
)
assert.ok(
  i18nSrc.includes('"Layout.Orientation.Portrait": "Portrait"'),
  "i18n must contain Layout.Orientation.Portrait",
)
assert.ok(
  i18nSrc.includes('"Layout.Orientation.Landscape": "Landscape"'),
  "i18n must contain Layout.Orientation.Landscape",
)

// Verify German translations exist
assert.ok(i18nSrc.includes('"Layout.Margins": "Ränder"'), "i18n must contain German Layout.Margins")
assert.ok(
  i18nSrc.includes('"Layout.Margins.Normal": "Normal"'),
  "i18n must contain German Layout.Margins.Normal",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Narrow": "Schmal"'),
  "i18n must contain German Layout.Margins.Narrow",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Moderate": "Mittel"'),
  "i18n must contain German Layout.Margins.Moderate",
)
assert.ok(
  i18nSrc.includes('"Layout.Margins.Wide": "Breit"'),
  "i18n must contain German Layout.Margins.Wide",
)
assert.ok(i18nSrc.includes('"Layout.Size": "Größe"'), "i18n must contain German Layout.Size")
assert.ok(i18nSrc.includes('"Layout.Size.A4": "A4"'), "i18n must contain German Layout.Size.A4")
assert.ok(
  i18nSrc.includes('"Layout.Size.Letter": "Letter"'),
  "i18n must contain German Layout.Size.Letter",
)
assert.ok(
  i18nSrc.includes('"Layout.Size.Legal": "Legal"'),
  "i18n must contain German Layout.Size.Legal",
)
assert.ok(i18nSrc.includes('"Layout.Size.A5": "A5"'), "i18n must contain German Layout.Size.A5")
assert.ok(
  i18nSrc.includes('"Layout.Orientation": "Ausrichtung"'),
  "i18n must contain German Layout.Orientation",
)
assert.ok(
  i18nSrc.includes('"Layout.Orientation.Portrait": "Hochformat"'),
  "i18n must contain German Layout.Orientation.Portrait",
)
assert.ok(
  i18nSrc.includes('"Layout.Orientation.Landscape": "Querformat"'),
  "i18n must contain German Layout.Orientation.Landscape",
)

console.log("All AF2-LAYOUT-MENUS tests passed!\n")
console.log("LAYOUT-MENUS-PASS")
