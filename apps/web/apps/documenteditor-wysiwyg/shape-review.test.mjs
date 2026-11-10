/**
 * P3-U03 gate: ShapeSettings + ReviewPopover + ExtendedColorDialog hosted
 * from the dialog engine.
 *
 * The OO views (documenteditor/main/app/view/ShapeSettings.js 2449 lines,
 * common/main/lib/view/ReviewPopover.js 1406 lines, common/main/lib/view/
 * ExtendedColorDialog.js) are ported as DIALOG SPECS (wo-dialogs.js
 * WO_DIALOG_SPECS.shapeSettings / reviewPopover / extendedColorDialog)
 * consumed by the P3-U01 WoDialogEngine, with the behavioral half in
 * editor.js:
 *   - runCommand("openShapeSettings") builds+syncs+opens (shape style
 *     persists as data-shape-* attrs + inline SVG paint attributes;
 *     gradients/shadows are CSS approximations),
 *   - runCommand("shapeSettings", okJson) applies the OK payload as one
 *     replayable ledger entry (svg fill/stroke/dasharray/caps/joins,
 *     <marker> arrowheads, box-shadow, geometry markers),
 *   - runCommand("openReviewPopover", commentId) opens the anchored
 *     single-thread editor; "reviewPopover" applies text edits, the
 *     resolved toggle and a reply (data-comment/data-resolved/data-replies),
 *   - runCommand("openExtendedColor", target) opens the custom-color dialog
 *     (hsbColorPicker widget + R/G/B/hex/opacity rows); "extendedColor"
 *     routes the picked color to the captured target (page background,
 *     shape fill/line/shadow).
 *
 * Zero dependencies: reads the real sources, imports the real ES module
 * against a minimal DOM stub, builds the dialogs from the real specs, and
 * asserts the engine conventions plus the editor.js/i18n/css/html wiring.
 *
 * Run with: node shape-review.test.mjs   → prints "SHAPE-REVIEW-PASS"
 */
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const js = readFileSync(new URL("./wo-dialogs.js", import.meta.url), "utf8")
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const editor = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")

// ---------------------------------------------------------------------------
// Minimal DOM stub (same surface as wo-dialogs.test.mjs / table-advanced)
// ---------------------------------------------------------------------------
function makeEl(tag = "div") {
  const listeners = {}
  const classes = new Set()
  const el = {
    tagName: String(tag).toUpperCase(),
    attrs: {},
    children: [],
    parentElement: null,
    focused: false,
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      removeProperty(k) { delete this._props[k]; },
      getPropertyValue(k) { return this._props[k] === undefined ? "" : this._props[k]; },
    },
    classList: {
      add(...cs) { cs.forEach((c) => classes.add(c)); },
      remove(...cs) { cs.forEach((c) => classes.delete(c)); },
      contains(c) { return classes.has(c); },
      toggle(c, on) { on ? classes.add(c) : classes.delete(c); },
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    hasAttribute(k) { return k in el.attrs; },
    removeAttribute(k) { delete el.attrs[k]; },
    appendChild(c) { el.children.push(c); c.parentElement = el; return c; },
    insertBefore(c, ref) {
      const i = el.children.indexOf(ref)
      if (i === -1) el.children.push(c)
      else el.children.splice(i, 0, c)
      c.parentElement = el
      return c
    },
    remove() {
      if (el.parentElement) {
        const i = el.parentElement.children.indexOf(el)
        if (i !== -1) el.parentElement.children.splice(i, 1)
        el.parentElement = null
      }
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
    focus() { el.focused = true; },
    closest(sel) {
      const parts = sel.split(",").map((s) => s.trim()).filter(Boolean)
      const matches = (n, s) => {
        if (!s.startsWith("[") || !s.endsWith("]")) return false
        return n.hasAttribute(s.slice(1, -1))
      }
      let node = el
      while (node) {
        if (parts.some((s) => matches(node, s))) return node
        node = node.parentElement
      }
      return null
    },
    querySelectorAll() { return []; },
    __listeners: listeners,
  }
  let text = ""
  Object.defineProperty(el, "textContent", { get: () => text, set: (v) => { text = String(v) } })
  let html_ = ""
  Object.defineProperty(el, "innerHTML", { get: () => html_, set: (v) => { html_ = String(v) } })
  Object.defineProperty(el, "className", {
    get: () => Array.from(classes).join(" "),
    set: (v) => {
      classes.clear()
      String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c))
    },
  })
  return el
}
const body = makeEl("body")
globalThis.document = { createElement: (t) => makeEl(t), body, activeElement: null }
globalThis.window = globalThis
if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.addEventListener !== "function") {
  const busListeners = {}
  globalThis.addEventListener = (type, fn) => { (busListeners[type] = busListeners[type] || []).push(fn) }
  globalThis.removeEventListener = (type, fn) => {
    const l = busListeners[type] || []
    const i = l.indexOf(fn)
    if (i !== -1) l.splice(i, 1)
  }
  globalThis.dispatchEvent = (ev) => { (busListeners[ev.type] || []).forEach((fn) => fn(ev)); return true }
}
if (typeof globalThis.CustomEvent !== "function") {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, params = {}) { this.type = type; this.detail = params.detail }
  }
}

// ---------------------------------------------------------------------------
// 1. Module surface — the three P3-U03 specs are exported engine specs
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
const SPECS = mod.WO_DIALOG_SPECS
for (const name of ["shapeSettings", "reviewPopover", "extendedColorDialog"]) {
  assert.ok(SPECS && SPECS[name], `WO_DIALOG_SPECS.${name} must exist`)
  assert.equal(typeof SPECS[name].id, "string", `${name}.id must be a string`)
  assert.match(SPECS[name].id, /^[a-z][a-z0-9-]*$/i, `${name}.id must be css-identifier-like`)
  assert.ok(Array.isArray(SPECS[name].sections) && SPECS[name].sections.length >= 1,
    `${name} must declare at least one section`)
  assert.equal(typeof SPECS[name].okCmd, "string", `${name}.okCmd required`)
}
assert.equal(SPECS.shapeSettings.id, "shape-settings-dialog")
assert.equal(SPECS.reviewPopover.id, "review-popover-dialog")
assert.equal(SPECS.extendedColorDialog.id, "extended-color-dialog")
assert.equal(SPECS.shapeSettings.okCmd, "shapeSettings")
assert.equal(SPECS.reviewPopover.okCmd, "reviewPopover")
assert.equal(SPECS.extendedColorDialog.okCmd, "extendedColor")
console.log("ok 1 shapeSettings / reviewPopover / extendedColorDialog specs exported")

// ---------------------------------------------------------------------------
// 2. ShapeSettings spec — fill (none/solid/gradient), line, shadow, geometry
// ---------------------------------------------------------------------------
const engine = new mod.WoDialogEngine()
const shapeSpec = SPECS.shapeSettings
const shapeRows = shapeSpec.sections.flatMap((s) => s.rows)
const shapeKeys = new Set(shapeRows.map((r) => r.key))
for (const key of ["fillType", "fill", "fillGradient", "line", "lineWidth", "lineStyle", "cap", "join",
                   "arrowBegin", "arrowEnd", "shadowOn", "shadowColor", "shadowBlur", "shadowOffset",
                   "moveWithText", "lockAspect"]) {
  assert.ok(shapeKeys.has(key), `shape spec must expose row ${key}`)
}
// Fill types mirror the OO fill kinds WO can approximate.
const fillTypes = shapeRows.find((r) => r.key === "fillType").options.map((o) => o.value)
assert.deepEqual(fillTypes, ["none", "solid", "gradient"], "fillType mirrors OO none/solid/gradient")
// The gradient fill consumes the P3-U01 MultiSliderGradient port.
const gradRow = shapeRows.find((r) => r.key === "fillGradient")
assert.equal(gradRow.type, "custom", "fillGradient is a custom (widget) row")
assert.equal(gradRow.widget, "multiSliderGradient", "fillGradient uses the multiSliderGradient widget")
// OO ShapeSettings exposes arrow styles (asc_putLinebeginstyle/endstyle).
assert.ok(shapeRows.find((r) => r.key === "arrowBegin").options.length >= 4, "begin arrow styles offered")
assert.ok(shapeRows.find((r) => r.key === "arrowEnd").options.length >= 4, "end arrow styles offered")
const shapeHtml = engine.renderSpec(shapeSpec)
assert.ok(shapeHtml.includes('data-wo-dialog="shape-settings-dialog"'), "shape dialog builds the engine overlay id")
assert.ok(shapeHtml.includes('data-wo-cmd="shapeSettings"'), "shape OK carries the ledger cmd")
assert.ok(shapeHtml.includes('data-wo-widget="multiSliderGradient"'), "gradient widget mounted for fill")
// Custom-color entry points route through the ExtendedColorDialog consumer.
const extendedButtons = (shapeHtml.match(/data-wo-cmd="openExtendedColor"/g) || []).length
assert.ok(extendedButtons >= 3, "fill/line/shadow rows offer the custom-color entry point")
assert.ok(shapeHtml.includes('data-wo-value="shape-fill"'), "fill custom color names its target")
assert.ok(shapeHtml.includes('data-wo-value="shape-line"'), "line custom color names its target")
assert.ok(shapeHtml.includes('data-wo-value="shape-shadow"'), "shadow custom color names its target")
console.log("ok 2 ShapeSettings spec: fill kinds, styler-grade rows, gradient widget, custom-color routing")

// ---------------------------------------------------------------------------
// 3. ReviewPopover spec — single-thread editor with reply/resolve/goto
// ---------------------------------------------------------------------------
const popSpec = SPECS.reviewPopover
const popRows = popSpec.sections.flatMap((s) => s.rows)
const popKeys = new Set(popRows.map((r) => r.key))
for (const key of ["text", "resolved", "reply"]) {
  assert.ok(popKeys.has(key), `popover spec must expose row ${key}`)
}
const popHtml = engine.renderSpec(popSpec)
assert.ok(popHtml.includes('data-wo-cmd="reviewPopover"'), "popover OK carries the ledger cmd")
assert.ok(popHtml.includes('data-wo-cmd="reviewPopoverGoTo"'), "Go to comment is a command row (asc anchor jump)")
assert.ok(popHtml.includes('data-wo-cmd="reviewPopoverDelete"'), "Delete is a command row")
// The reply row is the asc_addReply equivalent over data-replies.
assert.equal(popRows.find((r) => r.key === "reply").type, "text", "reply row is a text input")
console.log("ok 3 ReviewPopover spec: thread text + resolved + reply + goTo/delete command rows")

// ---------------------------------------------------------------------------
// 4. ExtendedColorDialog spec — the hsbColorPicker consumer
// ---------------------------------------------------------------------------
const extSpec = SPECS.extendedColorDialog
const extRows = extSpec.sections.flatMap((s) => s.rows)
const hsbRow = extRows.find((r) => r.key === "hsb")
assert.ok(hsbRow, "extended color exposes the hsb row")
assert.equal(hsbRow.widget, "hsbColorPicker", "extended color consumes the P3-U01 hsbColorPicker")
const extKeys = new Set(extRows.map((r) => r.key))
for (const key of ["r", "g", "b", "hex", "alpha"]) {
  assert.ok(extKeys.has(key), `extended color must expose row ${key}`)
}
const extHtml = engine.renderSpec(extSpec)
assert.ok(extHtml.includes('data-wo-widget="hsbColorPicker"'), "hsb widget mounted for the picker section")
assert.ok(extHtml.includes('data-wo-cmd="extendedColor"'), "extended color OK carries the ledger cmd")
console.log("ok 4 ExtendedColorDialog spec: hsbColorPicker widget + rgb/hex/alpha rows")

// ---------------------------------------------------------------------------
// 5. Engine conventions hold for all three specs (overlay chrome + i18n)
// ---------------------------------------------------------------------------
for (const spec of [shapeSpec, popSpec, extSpec]) {
  const htmlOut = engine.renderSpec(spec)
  assert.ok(htmlOut.includes('role="dialog"') && htmlOut.includes('aria-modal="true"'),
    `${spec.id}: engine modal conventions`)
  assert.ok(htmlOut.includes("data-wo-cancel=") && htmlOut.includes("data-wo-ok="),
    `${spec.id}: cancel/ok chrome`)
  assert.ok(htmlOut.includes("data-i18n="), `${spec.id}: i18n markers on generated labels`)
}
console.log("ok 5 all three specs render through the engine conventions (modal chrome + data-i18n)")

// ---------------------------------------------------------------------------
// 6. editor.js — behavioral half: command routing + open/apply functions
// ---------------------------------------------------------------------------
for (const fn of ["openShapeSettings", "applyShapeSettingsAdvanced", "syncShapeSettingsDialog",
                  "openReviewPopover", "applyReviewPopover", "anchorReviewPopover",
                  "openExtendedColorDialog", "applyExtendedColorDialog",
                  "reviewPopoverGoTo", "reviewPopoverDelete",
                  "applyShapeArrows", "shapeSvgChild"]) {
  assert.ok(editor.includes(`function ${fn}(`), `editor.js must define ${fn}()`)
}
for (const cmd of ["openShapeSettings", "shapeSettings", "openReviewPopover", "reviewPopover",
                   "reviewPopoverGoTo", "reviewPopoverDelete", "openExtendedColor", "extendedColor"]) {
  assert.ok(editor.includes(`cmd === "${cmd}"`), `runCommand routes ${cmd}`)
}
// Shape style persistence channels (data-shape-* + svg paint attributes).
for (const attr of ["data-shape-fill", "data-shape-gradient", "data-shape-line", "data-shape-arrows",
                    "data-shape-shadow", "data-shape-move-with-text", "data-shape-lock-aspect"]) {
  assert.ok(editor.includes(attr), `editor.js persists ${attr}`)
}
assert.ok(editor.includes('setAttribute("fill"') && editor.includes('setAttribute("stroke"'),
  "shape paint lands on the svg child fill/stroke")
assert.ok(editor.includes("stroke-dasharray"), "line style renders as dasharray")
assert.ok(editor.includes("marker-start") && editor.includes("marker-end"),
  "arrowheads render as svg markers")
assert.ok(editor.includes("createElementNS"), "marker defs injected via createElementNS")
// The rail "Advanced…" link routes shapes to ShapeSettings (object-kind routing).
assert.ok(editor.includes('classList.contains("drawing-shape")) { openShapeSettings()'),
  "image advanced link delegates drawing shapes to the shape dialog")
// Comment click → openReviewPopover (the OO popover trigger).
assert.ok(editor.includes('openReviewPopover", id'), "comment click emits openReviewPopover")
assert.ok(editor.includes("data-ctx=\"ShapeSettings\"".replace(/"/g, '"')) || editor.includes("ShapeSettings"),
  "ctx row handled in editor.js")
assert.ok(editor.includes('action === "ShapeSettings"'), "ctx ShapeSettings action routed")
console.log("ok 6 editor.js: command routing, shape persistence channels, popover trigger, ctx entry")

// ---------------------------------------------------------------------------
// 7. i18n — every new Dialog.* key exists in en AND de
// ---------------------------------------------------------------------------
const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
const enCut = i18n.slice(0, i18n.indexOf("const LOCALE_DE"))
const KEY_RE = /"(Dialog\.(?:ShapeAdvanced|ReviewPopover|ExtendedColor)\.[A-Za-z]+)"/g
const seen = new Set()
let m
while ((m = KEY_RE.exec(js)) !== null) seen.add(m[1])
assert.ok(seen.size >= 20, `spec label keys enumerated (found ${seen.size})`)
for (const k of seen) {
  assert.ok(enCut.includes(`"${k}"`), `en catalog missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de catalog missing ${k}`)
}
for (const k of ["Status.ShapeAdvancedApplied", "Status.ReviewPopoverApplied",
                 "Status.ExtendedColorApplied", "Ctx.ShapeSettings"]) {
  assert.ok(enCut.includes(`"${k}"`), `en catalog missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de catalog missing ${k}`)
}
console.log(`ok 7 i18n: ${seen.size} Dialog.* keys + status/ctx keys exist in en + de`)

// ---------------------------------------------------------------------------
// 8. Page wiring — module load, ctx row, popover css, shadow css
// ---------------------------------------------------------------------------
assert.ok(html.includes('<script type="module" src="wo-dialogs.js"></script>'),
  "index.html must load wo-dialogs.js as an ES module")
assert.ok(html.includes('data-ctx="ShapeSettings"'), "ctx menu ships the ShapeSettings row")
assert.ok(css.includes("wo-review-popover"), "style.css ships the anchored popover styles")
for (const cls of ["wo-engine-dialog", "wo-dlg-panel"]) {
  assert.ok(css.includes(cls), `style.css missing engine chrome style: ${cls}`)
}
console.log("ok 8 index.html ctx row + css wiring present")

console.log("SHAPE-REVIEW-PASS")
