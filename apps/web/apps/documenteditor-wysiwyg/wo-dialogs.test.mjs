// P3-U01 gate: data-driven dialog engine (wo-dialogs.js) + the three
// prerequisite OO widgets (tableStyler / hsbColorPicker / multiSliderGradient).
//
// Zero dependencies: reads the real sources, imports the real ES module
// (it is side-effect-free at import time), builds a 2-section dialog from a
// spec against a minimal DOM stub, and asserts the engine conventions:
// modal overlay markup, data-wo-cmd on every cmd row, wo-command bus
// emission, i18n keys in en + de, index.html module load, editor.js
// DIALOG_IDS registration seam.
//
// Run with: node wo-dialogs.test.mjs   → prints "WO-DIALOGS-PASS"
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const js = readFileSync(new URL("./wo-dialogs.js", import.meta.url), "utf8")
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const editor = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")

// ---------------------------------------------------------------------------
// Minimal DOM stub (just the surface wo-dialogs.js touches headlessly)
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
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    hasAttribute(k) { return k in el.attrs; },
    appendChild(c) { el.children.push(c); c.parentElement = el; return c; },
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
globalThis.window = globalThis // engine._emit dispatches on window
if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.addEventListener !== "function") {
  // Tiny event-bus shim for Node builds without global EventTarget.
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
// 1. Module surface — the real ES module imports and exports everything
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
for (const name of ["WoDialogEngine", "buildDialog", "tableStyler", "hsbColorPicker",
                    "multiSliderGradient", "WO_CUSTOM_WIDGETS", "hsbToHex", "hexToHsb"]) {
  assert.ok(mod[name], `wo-dialogs.js must export ${name}`)
}
assert.equal(typeof mod.WoDialogEngine.prototype.build, "function", "engine.build missing")
assert.equal(typeof mod.WoDialogEngine.prototype.renderSpec, "function", "engine.renderSpec missing")
assert.equal(typeof mod.buildDialog, "function", "buildDialog convenience missing")
for (const w of ["tableStyler", "hsbColorPicker", "multiSliderGradient"]) {
  assert.equal(mod.WO_CUSTOM_WIDGETS[w], mod[w], `custom row registry must expose ${w}`)
}
console.log("ok 1 module exports engine + three widget factories")

// ---------------------------------------------------------------------------
// 2. Engine builds DOM from a 2-section spec
// ---------------------------------------------------------------------------
const engine = new mod.WoDialogEngine()
const SPEC = {
  id: "engine-demo-dialog",
  title: "Engine demo",
  titleKey: "Dialog.Title",
  width: 480,
  sections: [
    {
      title: "Geometry", titleKey: "Dialog.Title",
      rows: [
        { type: "text", key: "name", label: "Name", labelKey: "Dialog.Title", value: "abc" },
        { type: "number", key: "width", label: "Width", labelKey: "Dialog.Title", min: 1, max: 100, value: 42, cmd: "demo.width" },
        { type: "select", key: "unit", label: "Unit", labelKey: "Dialog.Title", value: "cm",
          options: [{ value: "px", label: "px" }, { value: "cm", label: "cm" }], cmd: "demo.unit" },
        { type: "checkbox", key: "lock", label: "Lock", labelKey: "Dialog.Title", value: true, cmd: "demo.lock" },
      ],
    },
    {
      title: "Style", titleKey: "Dialog.Title",
      rows: [
        { type: "color", key: "tint", label: "Tint", labelKey: "Dialog.Title", value: "#4a6cf7", cmd: "demo.tint" },
        { type: "button", key: "reset", label: "Reset", labelKey: "Dialog.Title", cmd: "demo.reset", value: "all" },
        { type: "custom", key: "grad", label: "Gradient", labelKey: "Dialog.Title", widget: "multiSliderGradient", cmd: "demo.grad" },
      ],
    },
  ],
}
const handle = engine.build(SPEC)
assert.ok(handle, "build() must return a handle")
assert.equal(handle.id, "engine-demo-dialog")
const overlay = handle.el
assert.equal(overlay.getAttribute("id"), "engine-demo-dialog")
assert.equal(overlay.getAttribute("role"), "dialog", "engine dialogs use the same role=dialog convention")
assert.equal(overlay.getAttribute("aria-modal"), "true", "engine dialogs are modal like the static ones")
assert.equal(overlay.getAttribute("aria-labelledby"), "engine-demo-dialog-title")
assert.ok(overlay.classList.contains("dialog-overlay"), "overlay reuses .dialog-overlay styling")
assert.ok(overlay.classList.contains("wo-engine-dialog"), "engine overlay marked for engine CSS")
assert.ok(engine.get("engine-demo-dialog") === handle, "engine tracks built dialogs")
assert.ok(body.children.includes(overlay), "dialog mounted into document.body")

const panelHtml = overlay.children[0].innerHTML
assert.ok(panelHtml.includes('class="dialog wo-dlg-panel"'), "panel reuses .dialog styling")
assert.ok(panelHtml.includes("max-width:480"), "spec.width applied")
assert.ok(panelHtml.includes(">Geometry<") && panelHtml.includes(">Style<"), "both sections rendered")
for (const key of ["name", "width", "unit", "lock", "tint", "reset", "grad"]) {
  assert.ok(panelHtml.includes(`data-wo-row="${key}"`), `row ${key} rendered`)
}
for (const cmd of ["demo.width", "demo.unit", "demo.lock", "demo.tint", "demo.reset", "demo.grad"]) {
  assert.ok(panelHtml.includes(`data-wo-cmd="${cmd}"`), `cmd row ${cmd} carries data-wo-cmd`)
}
assert.ok(panelHtml.includes('data-i18n="Dialog.Title"'), "data-i18n markers on generated labels")
assert.ok(panelHtml.includes('data-i18n="Dialog.Cancel"'), "Cancel uses Dialog.Cancel key")
assert.ok(panelHtml.includes('data-i18n="Dialog.Apply"'), "OK uses Dialog.Apply key")
assert.ok(panelHtml.includes('data-wo-widget="multiSliderGradient"'), "custom row declares its widget factory")
assert.equal(engine.getValues("engine-demo-dialog").width, "42", "values initialized from spec defaults")
console.log("ok 2 engine builds a 2-section spec modal (conventions + data-wo-cmd)")

// ---------------------------------------------------------------------------
// 3. Commands flow through the wo-command bus (ledger channel)
// ---------------------------------------------------------------------------
const seen = []
globalThis.addEventListener("wo-command", (ev) => seen.push(ev.detail))
const click = overlay.__listeners.click[0]

// button row click → emits its cmd with its data-wo-value
const resetBtn = makeEl("button")
resetBtn.setAttribute("data-wo-cmd", "demo.reset")
resetBtn.setAttribute("data-wo-value", "all")
click({ target: resetBtn })
assert.deepEqual(seen.at(-1), { command: "demo.reset", value: "all" }, "button row click emits wo-command")

// OK button → one apply command whose value is the JSON of all row values
const okBtn = makeEl("button")
okBtn.setAttribute("data-wo-ok", "1")
okBtn.setAttribute("data-wo-cmd", "dialog.engine-demo-dialog.ok")
click({ target: okBtn })
const okEntry = seen.at(-1)
assert.equal(okEntry.command, "dialog.engine-demo-dialog.ok", "OK emits the dialog apply command")
const okPayload = JSON.parse(okEntry.value)
assert.equal(okPayload.width, "42", "apply payload carries row values")

// change event on a cmd row → updates the snapshot + emits the row command
const widthInput = makeEl("input")
widthInput.setAttribute("type", "number")
widthInput.setAttribute("data-wo-key", "width")
widthInput.setAttribute("data-wo-cmd", "demo.width")
widthInput.value = "77"
overlay.__listeners.change.forEach((fn) => fn({ target: widthInput }))
assert.deepEqual(seen.at(-1), { command: "demo.width", value: "77" }, "row change emits wo-command")
assert.equal(engine.getValues("engine-demo-dialog").width, "77", "change updates the value snapshot")

// open/close state matches the .open convention (editor.js Esc/trap compatible)
assert.ok(engine.open("engine-demo-dialog"), "open()")
assert.ok(overlay.classList.contains("open"), "open adds .open (same as static dialogs)")
assert.ok(engine.isOpen("engine-demo-dialog"))
engine.close("engine-demo-dialog")
assert.ok(!overlay.classList.contains("open"), "close removes .open")
console.log("ok 3 data-wo-cmd rows emit on the wo-command bus; OK applies all values")

// ---------------------------------------------------------------------------
// 4. DIALOG_IDS registration — live seam + pre-boot queue drain
// ---------------------------------------------------------------------------
assert.ok((globalThis.__WO_PENDING_DIALOG_IDS__ || []).includes("engine-demo-dialog"),
  "ids queue for editor.js when wo-dialogs.js boots first")
assert.ok(editor.includes("window.woRegisterDialogId"), "editor.js exposes the registration seam")
assert.ok(editor.includes("__WO_PENDING_DIALOG_IDS__"), "editor.js drains pre-boot registrations")
assert.ok(editor.includes("window.__WO_I18N_T__"), "editor.js exposes the i18n instance seam")
const seam = { pushed: [] }
globalThis.woRegisterDialogId = (id) => { seam.pushed.push(id); return true }
engine.registerDialogId("engine-second-dialog")
assert.ok(seam.pushed.includes("engine-second-dialog"), "registration routes through the editor.js seam when present")
console.log("ok 4 built ids reach editor.js DIALOG_IDS (seam + pending queue)")

// ---------------------------------------------------------------------------
// 5. Widgets — factories work headless (pure value state) and via markup
// ---------------------------------------------------------------------------
// hsbColorPicker: HSB↔hex model
assert.equal(mod.hsbToHex(0, 100, 100), "#ff0000", "hsbToHex red")
assert.equal(mod.hsbToHex(120, 100, 100), "#00ff00", "hsbToHex green")
assert.equal(mod.hsbToHex(240, 100, 100), "#0000ff", "hsbToHex blue")
assert.deepEqual(mod.hexToHsb("#ff0000"), { h: 0, s: 100, b: 100 }, "hexToHsb red")
const round = mod.hexToHsb(mod.hsbToHex(215, 63, 87))
assert.ok(Math.abs(round.h - 215) <= 2 && Math.abs(round.s - 63) <= 2 && Math.abs(round.b - 87) <= 2, "HSB↔hex roundtrip")
assert.equal(mod.hexToHsb("nope"), null, "hexToHsb rejects garbage")
const hsb = mod.hsbColorPicker(null, { color: "#ff8000" })
assert.equal(hsb.getValue().hex, "#ff8000", "hsb picker seeds from a hex color")
hsb.setValue("#00cc44")
assert.equal(hsb.getValue().hex, "#00cc44", "hsb picker setValue")
assert.match(js.replace(/\s/g, ""), /data-wo-hsb-h/, "hsb slider channel present")

// multiSliderGradient: stop list model with add/remove + ≥2 floor
const grad = mod.multiSliderGradient(null, {})
assert.equal(grad.getValue().length, 2, "gradient defaults to 2 stops")
grad.addStop(50, "#123456")
assert.equal(grad.getValue().length, 3, "addStop inserts")
grad.setValue([{ offset: 100, color: "#ffffff" }, { offset: 0, color: "#000000" }])
const sorted = grad.getValue()
assert.deepEqual(sorted.map((s) => s.offset), [0, 100], "setValue sorts stops")
assert.equal(sorted[0].color, "#000000", "stop payload keeps offset+color")
grad.removeStop(0)
assert.equal(grad.getValue().length, 2, "removeStop")
grad.removeStop(0)
assert.equal(grad.getValue().length, 2, "a gradient keeps at least 2 stops")
assert.match(js.replace(/\s/g, ""), /data-wo-grad-thumb/, "gradient thumb channel present")

// tableStyler: pen + painted-segment model
const ts = mod.tableStyler(null, { borders: [{ key: "h0-0", style: "solid", width: 2, color: "#ff0000" }] })
assert.equal(ts.getValue().borders.length, 1, "tableStyler seeds painted borders")
assert.equal(ts.getValue().borders[0].key, "h0-0")
ts.setAll()
assert.equal(ts.getValue().borders.length, 24, "3x3 grid ring = 24 paintable segments")
ts.clearAll()
assert.equal(ts.getValue().borders.length, 0, "clearAll")
assert.ok(ts.getValue().pen.style && ts.getValue().pen.width && ts.getValue().pen.color, "pen exposed in value")
assert.match(js.replace(/\s/g, ""), /data-wo-ts-seg/, "styler segment channel present")
console.log("ok 5 tableStyler / hsbColorPicker / multiSliderGradient factories work")

// ---------------------------------------------------------------------------
// 6. i18n — engine chrome + widget strings exist in en AND de catalogs
// ---------------------------------------------------------------------------
const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
const enCut = i18n.slice(0, i18n.indexOf("const LOCALE_DE"))
const KEYS = [
  "Dialog.Title", "Dialog.Ok", "Dialog.Cancel", "Dialog.Apply",
  "Widget.TableStyler.Title", "Widget.TableStyler.Style", "Widget.TableStyler.Width",
  "Widget.TableStyler.Color", "Widget.TableStyler.Clear", "Widget.TableStyler.All",
  "Widget.BorderStyle.None", "Widget.BorderStyle.Solid", "Widget.BorderStyle.Dashed",
  "Widget.BorderStyle.Dotted", "Widget.BorderStyle.Double",
  "Widget.HSB.Hue", "Widget.HSB.Saturation", "Widget.HSB.Brightness",
  "Widget.HSB.Hex", "Widget.HSB.Preview",
  "Widget.Gradient.Offset", "Widget.Gradient.Color",
  "Widget.Gradient.AddStop", "Widget.Gradient.RemoveStop",
]
for (const k of KEYS) {
  assert.ok(enCut.includes(`"${k}"`), `en catalog missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de catalog missing ${k}`)
}
console.log("ok 6 engine chrome + widget i18n keys exist in en + de")

// ---------------------------------------------------------------------------
// 7. Page wiring — index.html loads the module, CSS ships widget styles
// ---------------------------------------------------------------------------
assert.ok(html.includes('<script type="module" src="wo-dialogs.js"></script>'),
  "index.html must load wo-dialogs.js as an ES module")
for (const cls of ["wo-engine-dialog", "wo-dlg-section", "wo-ts-grid", "wo-hsb-swatch", "wo-grad-track"]) {
  assert.ok(css.includes(cls), `style.css missing engine/widget style: ${cls}`)
}
console.log("ok 7 index.html loads the module; style.css ships the widget styles")

// ---------------------------------------------------------------------------
// 8. P3-U02 — consumer dialog specs (TableSettingsAdvanced/ImageSettingsAdvanced)
//    export cleanly and render spec-shaped through the engine
// ---------------------------------------------------------------------------
assert.ok(mod.WO_DIALOG_SPECS, "consumer spec registry exported (WO_DIALOG_SPECS)")
assert.equal(mod.WO_DIALOG_SPECS.tableSettingsAdvanced.id, "table-settings-advanced-dialog")
assert.equal(mod.WO_DIALOG_SPECS.imageSettingsAdvanced.id, "image-settings-advanced-dialog")
const specEngine = new mod.WoDialogEngine()
const tablePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.tableSettingsAdvanced)
const imagePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.imageSettingsAdvanced)
assert.ok(tablePanel.includes('data-wo-cmd="tableSettingsAdvanced"'), "table OK emits its ledger cmd")
assert.ok(tablePanel.includes('data-wo-widget="tableStyler"'), "table spec consumes the styler widget")
assert.ok(imagePanel.includes('data-wo-cmd="imageSettingsAdvanced"'), "image OK emits its ledger cmd")
console.log("ok 8 P3-U02 consumer specs export + render through the engine")

// ---------------------------------------------------------------------------
// 9. P3-U03 — ShapeSettings / ReviewPopover / ExtendedColorDialog specs
// ---------------------------------------------------------------------------
assert.equal(mod.WO_DIALOG_SPECS.shapeSettings.id, "shape-settings-dialog")
assert.equal(mod.WO_DIALOG_SPECS.reviewPopover.id, "review-popover-dialog")
assert.equal(mod.WO_DIALOG_SPECS.extendedColorDialog.id, "extended-color-dialog")
const shapePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.shapeSettings)
const popoverPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.reviewPopover)
const extendedPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.extendedColorDialog)
assert.ok(shapePanel.includes('data-wo-cmd="shapeSettings"'), "shape OK emits its ledger cmd")
assert.ok(shapePanel.includes('data-wo-widget="multiSliderGradient"'), "shape fill consumes the gradient widget")
for (const key of ["fillType", "fill", "fillGradient", "line", "lineWidth", "lineStyle", "cap", "join",
                   "arrowBegin", "arrowEnd", "shadowOn", "shadowColor", "shadowBlur", "shadowOffset"]) {
  assert.ok(shapePanel.includes(`data-wo-row="${key}"`), `shape spec renders row ${key}`)
}
for (const cmd of ["shapeFillType", "shapeFillColor", "shapeFillGradient", "shapeLineColor",
                   "shapeArrowBegin", "shapeShadowOn", "openExtendedColor"]) {
  assert.ok(shapePanel.includes(`data-wo-cmd="${cmd}"`), `shape spec row carries cmd ${cmd}`)
}
assert.ok(popoverPanel.includes('data-wo-cmd="reviewPopover"'), "popover OK emits its ledger cmd")
for (const cmd of ["reviewPopoverGoTo", "reviewPopoverDelete"]) {
  assert.ok(popoverPanel.includes(`data-wo-cmd="${cmd}"`), `popover spec carries cmd ${cmd}`)
}
assert.ok(extendedPanel.includes('data-wo-cmd="extendedColor"'), "extended color OK emits its ledger cmd")
assert.ok(extendedPanel.includes('data-wo-widget="hsbColorPicker"'), "extended color consumes the HSB widget")
console.log("ok 9 P3-U03 shape/review-popover/extended-color specs export + render")

console.log("WO-DIALOGS-PASS")
