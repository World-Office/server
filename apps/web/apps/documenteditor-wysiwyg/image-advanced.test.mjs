/**
 * P3-U02 gate: ImageSettingsAdvanced hosted from the dialog engine.
 *
 * The OO view documenteditor/main/app/view/ImageSettingsAdvanced.js (3322
 * lines — size, rotation frame, text wrapping + distances + wrap-boundary
 * entry point, adjust sliders, crop, replace-image/from-URL, alt text) is
 * ported as a DIALOG SPEC (wo-dialogs.js
 * WO_DIALOG_SPECS.imageSettingsAdvanced) consumed by the P3-U01
 * WoDialogEngine, with the behavioral half in editor.js:
 *   - runCommand("openImageSettingsAdvanced") builds+syncs+opens,
 *   - runCommand("imageSettingsAdvanced", okJson) applies the OK payload as
 *     one replayable ledger entry,
 *   - dialog buttons emit real commands (rotate cw/ccw, replace via the
 *     existing objectOp "replace-image" funnel, wrap-boundary marker).
 *
 * Zero dependencies: reads the real sources, imports the real ES module
 * against a minimal DOM stub, builds the dialog from the real spec, and
 * asserts the engine conventions plus the editor.js/i18n/css wiring.
 *
 * Run with: node image-advanced.test.mjs   → prints "IMAGE-ADV-PASS"
 */
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const js = readFileSync(new URL("./wo-dialogs.js", import.meta.url), "utf8")
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const editor = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")

// ---------------------------------------------------------------------------
// Minimal DOM stub (same surface as wo-dialogs.test.mjs)
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
// 1. Spec surface — the real module exports the named spec with the OO
//    ImageSettingsAdvanced shape (size/rotation/wrap/adjust/crop/replace/alt)
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
assert.ok(mod.WO_DIALOG_SPECS, "wo-dialogs.js must export WO_DIALOG_SPECS")
const spec = mod.WO_DIALOG_SPECS.imageSettingsAdvanced
assert.ok(spec, "WO_DIALOG_SPECS.imageSettingsAdvanced missing")
assert.equal(spec.id, "image-settings-advanced-dialog")
assert.equal(typeof spec.okCmd, "string", "spec must declare its OK ledger command")
assert.ok(Array.isArray(spec.sections) && spec.sections.length >= 7,
  "OO ImageSettingsAdvanced parity: size / rotation / wrap / adjust / crop / replace / alt sections")
const rows = spec.sections.flatMap((s) => s.rows)
const rowKeys = rows.map((r) => r.key)
for (const key of ["width", "height", "keepRatio", "angle", "wrap", "distTop", "distBottom",
                   "distLeft", "distRight", "brightness", "contrast", "saturation",
                   "cropTop", "cropBottom", "cropLeft", "cropRight", "url", "alt"]) {
  assert.ok(rowKeys.includes(key), `spec row missing: ${key}`)
}
// the OO view's signature controls: rotation quick-steps + wrap-boundary entry
const buttonRows = rows.filter((r) => r.type === "button")
const cmds = buttonRows.map((r) => r.cmd)
for (const c of ["imageAdvancedRotate", "imageAdvancedReplace", "editWrapBoundary"]) {
  assert.ok(cmds.includes(c), `dialog button must emit command ${c}`)
}
// wrap option values ride the existing objectOp wrap values (same funnel as
// the ctx menu + right-panel: applyImageWrap → applyObjectOp)
const wrapRow = rows.find((r) => r.key === "wrap")
for (const v of ["wrap-inline", "wrap-square", "wrap-tight", "wrap-through",
                 "wrap-top-and-bottom", "wrap-behind", "wrap-front"]) {
  assert.ok(wrapRow.options.some((o) => o.value === v),
    `wrap select must carry the objectOp value ${v}`)
}
// adjust/crop are range rows (OO slider controls)
for (const key of ["brightness", "contrast", "saturation", "cropTop", "cropLeft"]) {
  assert.equal(rows.find((r) => r.key === key).type, "range", `${key} renders as a slider`)
}
console.log("ok 1 spec exported: id/okCmd + 7 OO sections + objectOp wrap values + button cmds")

// ---------------------------------------------------------------------------
// 2. Every i18n key referenced by the spec exists in en AND de catalogs
// ---------------------------------------------------------------------------
const enCat = i18n.slice(0, i18n.indexOf("const LOCALE_DE"))
const deCat = i18n.slice(i18n.indexOf("const LOCALE_DE"))
const specKeys = new Set([spec.titleKey, "Dialog.Cancel", "Dialog.Apply"])
spec.sections.forEach((s) => {
  specKeys.add(s.titleKey)
  s.rows.forEach((r) => {
    if (r.labelKey) specKeys.add(r.labelKey)
    if (Array.isArray(r.options)) r.options.forEach((o) => { if (o.labelKey) specKeys.add(o.labelKey) })
  })
})
for (const k of specKeys) {
  assert.ok(enCat.includes(`"${k}"`), `en catalog missing spec key ${k}`)
  assert.ok(deCat.includes(`"${k}"`), `de catalog missing spec key ${k}`)
}
console.log(`ok 2 all ${specKeys.size} spec i18n keys exist in en + de`)

// ---------------------------------------------------------------------------
// 3. Engine builds the dialog from the spec — engine conventions hold
// ---------------------------------------------------------------------------
const engine = new mod.WoDialogEngine()
const handle = engine.build(spec)
assert.equal(handle.id, "image-settings-advanced-dialog")
const overlay = handle.el
assert.equal(overlay.getAttribute("role"), "dialog", "modal overlay convention")
assert.equal(overlay.getAttribute("aria-modal"), "true")
assert.equal(overlay.getAttribute("aria-labelledby"), "image-settings-advanced-dialog-title")
assert.ok(overlay.classList.contains("dialog-overlay"), "reuses .dialog-overlay styling")
assert.ok(body.children.includes(overlay), "mounted into document.body")
const panelHtml = overlay.children[0].innerHTML
assert.ok(panelHtml.includes('data-wo-cmd="imageSettingsAdvanced"'),
  "OK button emits the spec's okCmd (the ledger entry)")
assert.ok(panelHtml.includes('data-i18n="Dialog.ImageAdvanced.Title"'), "data-i18n markers")
assert.ok(panelHtml.includes('type="range"'), "adjust/crop rows render as sliders")
assert.ok(panelHtml.includes('data-wo-cmd="editWrapBoundary"'),
  "wrap-boundary row emits the parked editWrapBoundary command")
assert.equal(engine.getValues("image-settings-advanced-dialog").brightness, "100",
  "values initialized from spec defaults")
// setValue re-syncs the live controls (OO views re-read properties on show)
engine.setValue("image-settings-advanced-dialog", "angle", 45)
assert.equal(engine.getValues("image-settings-advanced-dialog").angle, "45",
  "setValue updates the value snapshot")
engine.setValue("image-settings-advanced-dialog", "keepRatio", true)
assert.equal(engine.getValues("image-settings-advanced-dialog").keepRatio, "true",
  "checkbox values snapshot as true/false strings")
console.log("ok 3 engine builds the real spec modal (conventions + setValue sync)")

// ---------------------------------------------------------------------------
// 4. Button commands flow through the wo-command bus — and editor.js handles
//    exactly those command names
// ---------------------------------------------------------------------------
const seen = []
globalThis.addEventListener("wo-command", (ev) => seen.push(ev.detail))
const click = overlay.__listeners.click[0]
const rotBtn = makeEl("button")
rotBtn.setAttribute("data-wo-cmd", "imageAdvancedRotate")
rotBtn.setAttribute("data-wo-value", "ccw")
click({ target: rotBtn })
assert.deepEqual(seen.at(-1), { command: "imageAdvancedRotate", value: "ccw" },
  "rotate-ccw button emits its command with its value")

const okBtn = makeEl("button")
okBtn.setAttribute("data-wo-ok", "1")
okBtn.setAttribute("data-wo-cmd", spec.okCmd)
click({ target: okBtn })
const entry = seen.at(-1)
assert.equal(entry.command, spec.okCmd, "OK emits the spec okCmd")
const payload = JSON.parse(entry.value)
for (const key of ["width", "height", "keepRatio", "angle", "wrap", "brightness",
                   "cropLeft", "url", "alt"]) {
  assert.ok(key in payload, `OK payload carries row ${key}`)
}
// the exact command strings the spec emits are the ones runCommand dispatches
for (const c of [spec.okCmd, "imageAdvancedRotate", "imageAdvancedReplace", "editWrapBoundary"]) {
  assert.ok(editor.includes(`cmd === "${c}"`), `editor.js must dispatch cmd === "${c}"`)
}
console.log("ok 4 button/OK payloads → wo-command bus → editor.js dispatch")

// ---------------------------------------------------------------------------
// 5. editor.js behavioral half — open/sync/apply/target capture/funnels
// ---------------------------------------------------------------------------
assert.ok(editor.includes('cmd === "openImageSettingsAdvanced"'),
  "runCommand must open the dialog")
assert.ok(editor.includes("function openImageSettingsAdvanced"), "open function exists")
assert.ok(editor.includes("function syncImageAdvancedDialog"),
  "open-time re-sync exists (OO views re-read properties on show)")
assert.ok(editor.includes("function applyImageSettingsAdvanced"), "apply function exists")
assert.ok(editor.includes("imageAdvTarget"),
  "dialog steals the DOM selection — target captured at open time")
assert.ok(editor.includes("WO_DIALOG_SPECS.imageSettingsAdvanced"),
  "editor builds the dialog from the real spec")
assert.ok(editor.includes("function applyImageAdvancedRotate"),
  "rotate buttons apply through the captured target")
assert.ok(editor.includes('applyObjectOp("replace-image")'),
  "replace reuses the existing objectOp replace-image funnel")
assert.ok(editor.includes("data-rotate-angle"),
  "arbitrary angle (OO RotationFrame) composes into the object transform")
assert.ok(editor.includes("clip-path") || editor.includes("clipPath"),
  "crop applies as an honest CSS clip-path approximation")
assert.ok(editor.includes("data-image-brightness"),
  "adjust applies via the filter channel + reopen attributes")
assert.ok(editor.includes("reportEditWrapBoundaryUnavailable"),
  "wrap-boundary stays on the registered LOUD-LIMITED divergence path")
assert.ok(editor.includes("applyImageAltText(v.alt"),
  "alt text funnels through the converged applyImageAltText")
assert.ok(editor.includes("wo:open-image-settings"),
  "AF15 marker event stays wired (host page / E2E)")
assert.ok(editor.includes('emitCommand("openImageSettingsAdvanced")'),
  "rp-image-advanced rail link opens the engine dialog")
console.log("ok 5 editor.js open/sync/apply wiring + funnels + rp rail link")

// ---------------------------------------------------------------------------
// 6. Page wiring — module load, CSS, mount point
// ---------------------------------------------------------------------------
assert.ok(html.includes('<script type="module" src="wo-dialogs.js"></script>'),
  "index.html loads the engine module")
assert.ok(html.includes('id="rp-image-advanced"'), "advanced rail link exists")
for (const cls of ["wo-engine-dialog", "wo-dlg-section", "wo-dlg-row-range"]) {
  assert.ok(css.includes(cls), `style.css missing engine style: ${cls}`)
}
console.log("ok 6 index.html loads the module; style.css ships the styles")

console.log("IMAGE-ADV-PASS")
