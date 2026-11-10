/**
 * P3-U02 gate: TableSettingsAdvanced hosted from the dialog engine.
 *
 * The OO view documenteditor/main/app/view/TableSettingsAdvanced.js (2179
 * lines — cell margins/distances, table alignment + indent, text flow around
 * the table, TableStyler-driven borders/shading, repeat-as-header, resize
 * behavior) is ported as a DIALOG SPEC (wo-dialogs.js
 * WO_DIALOG_SPECS.tableSettingsAdvanced) consumed by the P3-U01
 * WoDialogEngine, with the behavioral half in editor.js:
 *   - runCommand("openTableSettingsAdvanced") builds+syncs+opens,
 *   - runCommand("tableSettingsAdvanced", okJson) applies the OK payload as
 *     one replayable ledger entry.
 *
 * Zero dependencies: reads the real sources, imports the real ES module
 * against a minimal DOM stub, builds the dialog from the real spec, and
 * asserts the engine conventions plus the editor.js/i18n/css wiring.
 *
 * Run with: node table-advanced.test.mjs   → prints "TABLE-ADV-PASS"
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
//    TableSettingsAdvanced shape (4 sections, tableStyler consumer)
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
assert.ok(mod.WO_DIALOG_SPECS, "wo-dialogs.js must export WO_DIALOG_SPECS")
const spec = mod.WO_DIALOG_SPECS.tableSettingsAdvanced
assert.ok(spec, "WO_DIALOG_SPECS.tableSettingsAdvanced missing")
assert.equal(spec.id, "table-settings-advanced-dialog")
assert.equal(typeof spec.okCmd, "string", "spec must declare its OK ledger command")
assert.ok(spec.okCmd.length > 0)
assert.ok(Array.isArray(spec.sections) && spec.sections.length >= 4,
  "OO TableSettingsAdvanced parity: position / cell margins / borders+shading / rows sections")
const rows = spec.sections.flatMap((s) => s.rows)
const rowKeys = rows.map((r) => r.key)
for (const key of ["align", "indent", "wrap", "distTop", "distBottom", "distLeft", "distRight",
                   "marginTop", "marginBottom", "marginLeft", "marginRight"]) {
  assert.ok(rowKeys.includes(key), `spec row missing: ${key}`)
}
const stylerRow = rows.find((r) => r.type === "custom")
assert.ok(stylerRow, "the borders section must carry a custom row (OO TableStyler consumer)")
assert.equal(stylerRow.widget, "tableStyler", "custom row must consume the P3-U01 tableStyler widget")
assert.equal(mod.WO_CUSTOM_WIDGETS.tableStyler, mod.tableStyler, "tableStyler factory registered")
console.log("ok 1 spec exported: id/okCmd + 4 OO sections + tableStyler consumer row")

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
assert.equal(handle.id, "table-settings-advanced-dialog")
const overlay = handle.el
assert.equal(overlay.getAttribute("role"), "dialog", "modal overlay convention")
assert.equal(overlay.getAttribute("aria-modal"), "true")
assert.equal(overlay.getAttribute("aria-labelledby"), "table-settings-advanced-dialog-title")
assert.ok(overlay.classList.contains("dialog-overlay"), "reuses .dialog-overlay styling")
assert.ok(body.children.includes(overlay), "mounted into document.body")
const panelHtml = overlay.children[0].innerHTML
assert.ok(panelHtml.includes('data-wo-cmd="tableSettingsAdvanced"'),
  "OK button emits the spec's okCmd (the ledger entry)")
for (const key of ["align", "indent", "wrap", "moveWithText", "allowOverlap", "distTop",
                   "marginTop", "shade", "styler", "repeatHeader", "resizeFit"]) {
  assert.ok(panelHtml.includes(`data-wo-row="${key}"`), `row ${key} rendered`)
}
assert.ok(panelHtml.includes('data-wo-widget="tableStyler"'), "tableStyler mount declared")
assert.ok(panelHtml.includes('data-i18n="Dialog.TableAdvanced.Title"'), "data-i18n markers")
assert.equal(engine.getValues("table-settings-advanced-dialog").align, "left",
  "values initialized from spec defaults")
console.log("ok 3 engine builds the real spec modal (conventions + ok cmd)")

// ---------------------------------------------------------------------------
// 4. tableStyler consumer rides the OK payload; setValue re-syncs it
// ---------------------------------------------------------------------------
// Headless build skips widget mounting (stub querySelectorAll returns []), so
// mount the factory exactly like the engine does and hand the instance to the
// engine's widget registry (this.widgets — public on the engine instance).
const mount = makeEl("div")
mount.setAttribute("data-wo-key", "styler")
overlay.appendChild(mount)
const stylerInstance = mod.tableStyler(mount, {
  style: "solid", width: 2, color: "#000000",
  // The engine's _mount wires onChange → snapshot; mirror that contract here.
  onChange: (value) => {
    engine._values("table-settings-advanced-dialog").styler = value;
  },
})
engine.widgets.push(stylerInstance)
handle.setValue("styler", { pen: { style: "dashed", width: 4, color: "#123456" },
                            borders: [{ key: "h0-0", style: "solid", width: 2, color: "#ff0000" }] })
const stylerValue = engine.getValues("table-settings-advanced-dialog").styler
assert.ok(stylerValue && stylerValue.pen, "setValue routes through the widget instance")
assert.equal(stylerValue.pen.style, "dashed", "widget pen re-synced from document state")
assert.equal(stylerValue.borders.length, 1, "painted segments survive the sync")
handle.setValue("styler", { pen: { style: "solid", width: 2, color: "#000000" }, borders: [] })
assert.equal(engine.getValues("table-settings-advanced-dialog").styler.borders.length, 0,
  "clearing painted segments re-syncs the snapshot")
console.log("ok 4 tableStyler instance syncs via engine.setValue (open-time re-read)")

// ---------------------------------------------------------------------------
// 5. OK emits ONE ledger entry on the wo-command bus — and editor.js handles
//    exactly that command name
// ---------------------------------------------------------------------------
const seen = []
globalThis.addEventListener("wo-command", (ev) => seen.push(ev.detail))
const click = overlay.__listeners.click[0]
const okBtn = makeEl("button")
okBtn.setAttribute("data-wo-ok", "1")
okBtn.setAttribute("data-wo-cmd", spec.okCmd)
click({ target: okBtn })
const entry = seen.at(-1)
assert.equal(entry.command, spec.okCmd, "OK emits the spec okCmd")
const payload = JSON.parse(entry.value)
for (const key of ["align", "indent", "wrap", "moveWithText", "allowOverlap", "distTop",
                   "marginTop", "shade", "styler", "repeatHeader", "resizeFit"]) {
  assert.ok(key in payload, `OK payload carries row ${key}`)
}
assert.ok(payload.styler && Array.isArray(payload.styler.borders), "styler value in payload")
// the exact command string the engine emits is the one runCommand dispatches
assert.ok(editor.includes(`cmd === "${spec.okCmd}"`),
  `editor.js must dispatch cmd === "${spec.okCmd}"`)
assert.ok(editor.includes(`applyTableSettingsAdvanced(value)`),
  "editor.js routes the payload into applyTableSettingsAdvanced")
console.log("ok 5 OK payload → wo-command bus → editor.js applyTableSettingsAdvanced")

// ---------------------------------------------------------------------------
// 6. editor.js behavioral half — open/sync/apply/target capture
// ---------------------------------------------------------------------------
assert.ok(editor.includes('cmd === "openTableSettingsAdvanced"'),
  "runCommand must open the dialog")
assert.ok(editor.includes("function openTableSettingsAdvanced"), "open function exists")
assert.ok(editor.includes("function syncTableAdvancedDialog"),
  "open-time re-sync exists (OO views re-read properties on show)")
assert.ok(editor.includes("function applyTableSettingsAdvanced"), "apply function exists")
assert.ok(editor.includes("tableAdvTarget"),
  "dialog steals the DOM selection — target captured at open time")
assert.ok(editor.includes("WO_DIALOG_SPECS.tableSettingsAdvanced"),
  "editor builds the dialog from the real spec")
assert.ok(editor.includes("table-repeat-header"),
  "repeat-as-header applies (OO TableSettingsAdvanced header repetition)")
assert.ok(editor.includes("tableLayout"),
  "resize behavior applies (OO 'resize cells to fit')")
assert.ok(editor.includes('emitCommand("openTableSettingsAdvanced")'),
  "rp-table-advanced rail link opens the engine dialog")
assert.ok(editor.includes('emitCommand("openBorders")'),
  "AF15 borders-dialog fallback kept for the engine-less path")
console.log("ok 6 editor.js open/sync/apply wiring + rp rail link")

// ---------------------------------------------------------------------------
// 7. Page wiring — module load, CSS, mount point
// ---------------------------------------------------------------------------
assert.ok(html.includes('<script type="module" src="wo-dialogs.js"></script>'),
  "index.html loads the engine module")
assert.ok(html.includes('id="rp-table-advanced"'), "advanced rail link exists")
for (const cls of ["wo-engine-dialog", "wo-dlg-section", "wo-dlg-row-range"]) {
  assert.ok(css.includes(cls), `style.css missing engine style: ${cls}`)
}
console.log("ok 7 index.html loads the module; style.css ships the styles")

console.log("TABLE-ADV-PASS")
