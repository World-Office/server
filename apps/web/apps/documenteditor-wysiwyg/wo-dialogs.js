/**
 * wo-dialogs.js — data-driven dialog engine (ORM-09 Phase 3, task P3-U01).
 *
 * ORM-09 (plan/oo-port/ui-webapp.md) measured ~10k lines of OnlyOffice view
 * code against this editor and rejected hand-entered HTML as the porting
 * vehicle. This module is the generic engine instead: a dialog is DATA
 * (a spec object), the engine renders it as DOM with the exact conventions
 * the 65 hand-written dialogs in index.html already use, and the three OO
 * common components the ledger lists as porting prerequisites ship as
 * spec row-type "custom" widget factories in the same file:
 *
 *   - WoDialogEngine.build(spec)  spec = { id, title, titleKey, width,
 *       sections: [{ title, titleKey, rows: [{ type, key, label, ... }] }] }
 *     row types: button | checkbox | number | select | text | color | custom
 *
 *   Engine conventions (mirrors index.html dialogs exactly):
 *     (a) overlay div.dialog-overlay[role=dialog][aria-modal=true]
 *         [aria-labelledby={id}-title] with a div.dialog panel — the same
 *         CSS the static dialogs use — plus editor.js's modal Tab trap and
 *         global Esc close for free: every built id is registered into
 *         editor.js DIALOG_IDS via the woRegisterDialogId() seam (or the
 *         __WO_PENDING_DIALOG_IDS__ queue when this module boots first).
 *     (b) every row that declares a `cmd` carries a data-wo-cmd attribute
 *         and the engine dispatches plain `wo-command` CustomEvents — the
 *         same bus runCommand()/recordCommand()/replayCommands() already
 *         consume — so engine dialogs join the command ledger unchanged.
 *         The OK button emits one command whose value is the JSON of all
 *         row values (one replayable ledger entry per dialog apply).
 *     (c) generated markup uses data-i18n markers; strings are resolved
 *         through the i18n.js catalogs (en defaults + de) using the same
 *         only-missing seed pattern as editor.js seedUiStrings(), and
 *         applyTranslations() runs over the built DOM after mount.
 *
 *   Widgets (spec row { type: "custom", widget: "<factory name>" }):
 *     - tableStyler          border-painting grid (style/width/color pen,
 *                            click segments to paint/erase — the OO
 *                            TableStyler interaction model)
 *     - hsbColorPicker       hue/saturation/brightness sliders + hex input
 *                            + live preview swatch
 *     - multiSliderGradient  gradient-stop track with draggable thumbs,
 *                            add (track click / button) and remove per stop
 *
 * The module is side-effect-free at import time (no document/window touch),
 * so Node can import and headless-test it; widget factories keep their
 * value state in plain objects so get/setValue work without a DOM.
 */

// ---------------------------------------------------------------------------
// Engine chrome + widget strings. The real catalogs live in i18n.js
// (DEFAULT_TRANSLATIONS = en, LOCALE_CATALOGS.de = de — kept in sync there);
// these pairs re-use editor.js's seedUiStrings() only-missing pattern so a
// dialog built against an i18n instance whose bucket predates the catalog
// still renders real text.
// ---------------------------------------------------------------------------
const ENGINE_I18N_EN = {
  "Dialog.Title": "Dialog",
  "Dialog.Ok": "OK",
  "Dialog.Apply": "Apply",
  "Widget.TableStyler.Title": "Table borders",
  "Widget.TableStyler.Style": "Border style",
  "Widget.TableStyler.Width": "Border width",
  "Widget.TableStyler.Color": "Border color",
  "Widget.TableStyler.Clear": "Clear all",
  "Widget.TableStyler.All": "All borders",
  "Widget.BorderStyle.None": "No border",
  "Widget.BorderStyle.Solid": "Solid",
  "Widget.BorderStyle.Dashed": "Dashed",
  "Widget.BorderStyle.Dotted": "Dotted",
  "Widget.BorderStyle.Double": "Double",
  "Widget.HSB.Hue": "Hue",
  "Widget.HSB.Saturation": "Saturation",
  "Widget.HSB.Brightness": "Brightness",
  "Widget.HSB.Hex": "Hex value",
  "Widget.HSB.Preview": "Preview",
  "Widget.Gradient.Offset": "Offset (%)",
  "Widget.Gradient.Color": "Stop color",
  "Widget.Gradient.AddStop": "Add stop",
  "Widget.Gradient.RemoveStop": "Remove stop",
};
const ENGINE_I18N_DE = {
  "Dialog.Title": "Dialog",
  "Dialog.Ok": "OK",
  "Dialog.Apply": "Übernehmen",
  "Widget.TableStyler.Title": "Tabellenränder",
  "Widget.TableStyler.Style": "Rahmenstil",
  "Widget.TableStyler.Width": "Rahmenbreite",
  "Widget.TableStyler.Color": "Rahmenfarbe",
  "Widget.TableStyler.Clear": "Alle entfernen",
  "Widget.TableStyler.All": "Alle Rahmen",
  "Widget.BorderStyle.None": "Kein Rahmen",
  "Widget.BorderStyle.Solid": "Durchgehend",
  "Widget.BorderStyle.Dashed": "Gestrichelt",
  "Widget.BorderStyle.Dotted": "Gepunktet",
  "Widget.BorderStyle.Double": "Doppelt",
  "Widget.HSB.Hue": "Ton",
  "Widget.HSB.Saturation": "Sättigung",
  "Widget.HSB.Brightness": "Helligkeit",
  "Widget.HSB.Hex": "Hex-Wert",
  "Widget.HSB.Preview": "Vorschau",
  "Widget.Gradient.Offset": "Position (%)",
  "Widget.Gradient.Color": "Farbe des Stops",
  "Widget.Gradient.AddStop": "Stop hinzufügen",
  "Widget.Gradient.RemoveStop": "Stop entfernen",
};
function seedEngineStrings(tFn) {
  const bucket = tFn && tFn.resources && tFn.resources[tFn.lng] && tFn.resources[tFn.lng].translation;
  if (!bucket) return false;
  const pair = tFn.lng && tFn.lng.indexOf("de") === 0 ? ENGINE_I18N_DE : ENGINE_I18N_EN;
  Object.keys(pair).forEach((k) => {
    if (bucket[k] === undefined) bucket[k] = pair[k];
  });
  return true;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function clamp(n, lo, hi) {
  n = Number(n);
  if (!isFinite(n)) n = lo;
  return Math.min(hi, Math.max(lo, n));
}
function q(root, sel) {
  try {
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  } catch (err) {
    return [];
  }
}
function on(node, type, fn) {
  if (node && typeof node.addEventListener === "function") node.addEventListener(type, fn);
}
function hasDom() {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

// ---------------------------------------------------------------------------
// Color math (pure — the HSBColorPicker's model layer, Node-testable)
// ---------------------------------------------------------------------------
/** HSB (h 0-360, s/b 0-100) → "#rrggbb" lowercase. */
export function hsbToHex(h, s, b) {
  h = ((Number(h) || 0) % 360 + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  b = clamp(b, 0, 100) / 100;
  const c = b * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = b - c;
  let r = 0, g = 0, bl = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; bl = x; }
  else if (h < 240) { g = x; bl = c; }
  else if (h < 300) { r = x; bl = c; }
  else { r = c; bl = x; }
  const to2 = (v) => {
    const n = Math.round((v + m) * 255);
    return ("0" + clamp(n, 0, 255).toString(16)).slice(-2);
  };
  return "#" + to2(r) + to2(g) + to2(bl);
}
/** "#rgb" / "#rrggbb" → {h, s, b} (h 0-360, s/b 0-100); null when unparseable. */
export function hexToHsb(hex) {
  let m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) m = /^#?([0-9a-f]{3})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let str = m[1];
  if (str.length === 3) str = str[0] + str[0] + str[1] + str[1] + str[2] + str[2];
  const r = parseInt(str.slice(0, 2), 16) / 255;
  const g = parseInt(str.slice(2, 4), 16) / 255;
  const b = parseInt(str.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(max === 0 ? 0 : (d / max) * 100), b: Math.round(max * 100) };
}

// ---------------------------------------------------------------------------
// Widget 1: tableStyler — OO common/lib/component/TableStyler.js port.
// A 3×3 cell preview ringed by 24 clickable border segments; the current
// pen (style/width/color) paints a clicked segment, clicking a painted
// segment erases it. Model: painted = Map(key → {style,width,color}).
// ---------------------------------------------------------------------------
const TS_STYLES = ["none", "solid", "dashed", "dotted", "double"];
const TS_WIDTHS = [
  { v: 1, label: "0.5pt" }, { v: 2, label: "1pt" }, { v: 3, label: "1.5pt" },
  { v: 4, label: "2.25pt" }, { v: 6, label: "3pt" },
];
const TS_ROWS = 3, TS_COLS = 3;

function tsSegKey(type, line, idx) { return type + line + "-" + idx; }

function tsSegmentSpecs() {
  // 12 horizontal (4 lines × 3 cols) + 12 vertical (4 lines × 3 rows).
  const segs = [];
  for (let line = 0; line <= TS_ROWS; line++) {
    for (let col = 0; col < TS_COLS; col++) {
      segs.push({
        key: tsSegKey("h", line, col), type: "h", line, idx: col,
        left: (col * 100) / TS_COLS, top: (line * 100) / TS_ROWS,
        w: 100 / TS_COLS, h: null,
      });
    }
  }
  for (let line = 0; line <= TS_COLS; line++) {
    for (let row = 0; row < TS_ROWS; row++) {
      segs.push({
        key: tsSegKey("v", line, row), type: "v", line, idx: row,
        left: (line * 100) / TS_COLS, top: (row * 100) / TS_ROWS,
        w: null, h: 100 / TS_ROWS,
      });
    }
  }
  return segs;
}
const TS_SEGMENTS = tsSegmentSpecs();

export function tableStyler(root, opts = {}) {
  const state = {
    pen: {
      style: TS_STYLES.indexOf(opts.style) !== -1 ? opts.style : "solid",
      width: opts.width || 2,
      color: opts.color || "#000000",
    },
    painted: new Map(), // key → {style, width, color}
  };
  if (Array.isArray(opts.borders)) {
    opts.borders.forEach((b) => {
      if (b && typeof b.key === "string") {
        state.painted.set(b.key, { style: b.style || "solid", width: b.width || 2, color: b.color || "#000000" });
      }
    });
  }
  const handle = {
    widget: "tableStyler",
    el: null,
    getValue() {
      return {
        pen: Object.assign({}, state.pen),
        borders: Array.from(state.painted.keys()).sort().map((key) => Object.assign({ key }, state.painted.get(key))),
      };
    },
    setValue(next) {
      state.pen = Object.assign(state.pen, (next && next.pen) || {});
      state.painted = new Map();
      ((next && next.borders) || []).forEach((b) => {
        if (b && typeof b.key === "string") {
          state.painted.set(b.key, { style: b.style || "solid", width: b.width || 2, color: b.color || "#000000" });
        }
      });
      paint();
      fire();
      return handle;
    },
    clearAll() { state.painted.clear(); paint(); fire(); return handle; },
    setAll() {
      TS_SEGMENTS.forEach((s) => state.painted.set(s.key, Object.assign({}, state.pen)));
      paint(); fire(); return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
    if (typeof CustomEvent === "function" && mounted && typeof root.dispatchEvent === "function") {
      try {
        root.dispatchEvent(new CustomEvent("wo-dialog-change", { detail: { widget: "tableStyler", value: handle.getValue() } }));
      } catch (err) { /* headless */ }
    }
  }
  if (!mounted) return handle; // headless: pure model only
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);

  root.setAttribute("data-wo-widget-root", "tableStyler");
  const styleOptions = TS_STYLES.map((s) =>
    '<option value="' + s + '"' + (s === state.pen.style ? " selected" : "") + ">" + escHtml(tr("Widget.BorderStyle." + s.charAt(0).toUpperCase() + s.slice(1), s)) + "</option>"
  ).join("");
  const widthOptions = TS_WIDTHS.map((w) =>
    '<option value="' + w.v + '"' + (Number(w.v) === Number(state.pen.width) ? " selected" : "") + ">" + escHtml(w.label) + "</option>"
  ).join("");
  root.innerHTML =
    '<div class="wo-ts-tools" role="group" aria-label="' + escHtml(tr("Widget.TableStyler.Title", "Table borders")) + '">' +
      '<label class="wo-ts-tool"><span data-i18n="Widget.TableStyler.Style">Border style</span>' +
        '<select data-wo-ts-style aria-label="' + escHtml(tr("Widget.TableStyler.Style", "Border style")) + '">' + styleOptions + "</select></label>" +
      '<label class="wo-ts-tool"><span data-i18n="Widget.TableStyler.Width">Border width</span>' +
        '<select data-wo-ts-width aria-label="' + escHtml(tr("Widget.TableStyler.Width", "Border width")) + '">' + widthOptions + "</select></label>" +
      '<label class="wo-ts-tool"><span data-i18n="Widget.TableStyler.Color">Border color</span>' +
        '<input type="color" data-wo-ts-color value="' + escHtml(state.pen.color) + '" aria-label="' + escHtml(tr("Widget.TableStyler.Color", "Border color")) + '" /></label>' +
      '<button type="button" class="wo-ts-btn" data-wo-ts-clear data-i18n="Widget.TableStyler.Clear">Clear all</button>' +
      '<button type="button" class="wo-ts-btn" data-wo-ts-all data-i18n="Widget.TableStyler.All">All borders</button>' +
    "</div>" +
    '<div class="wo-ts-grid" data-wo-ts-grid role="group" aria-label="' + escHtml(tr("Widget.TableStyler.Title", "Table borders")) + '">' +
      '<div class="wo-ts-cellwrap">' +
        TS_SEGMENTS.map((s) => {
          const geom = s.type === "h"
            ? "left:calc(" + s.left + "% + 6px);width:calc(" + s.w + "% - 12px);top:calc(" + s.top + "% - 5px);height:10px;"
            : "left:calc(" + s.left + "% - 5px);width:10px;top:calc(" + s.top + "% + 6px);height:calc(" + s.h + "% - 12px);";
          return '<button type="button" class="wo-ts-seg" data-wo-ts-seg="' + s.key + '" aria-pressed="false" style="' + geom + '"></button>';
        }).join("") +
      "</div>" +
    "</div>";

  const styleSel = q(root, "[data-wo-ts-style]")[0];
  const widthSel = q(root, "[data-wo-ts-width]")[0];
  const colorIn = q(root, "[data-wo-ts-color]")[0];
  const grid = q(root, "[data-wo-ts-grid]")[0];
  handle.el = root;

  function penFromControls() {
    if (styleSel) state.pen.style = styleSel.value || state.pen.style;
    if (widthSel) state.pen.width = Number(widthSel.value) || state.pen.width;
    if (colorIn) state.pen.color = colorIn.value || state.pen.color;
  }
  function paint() {
    if (!mounted) return; // headless: state only
    q(grid, "[data-wo-ts-seg]").forEach((seg) => {
      const key = seg.getAttribute("data-wo-ts-seg");
      const p = state.painted.get(key);
      seg.setAttribute("aria-pressed", p ? "true" : "false");
      seg.className = "wo-ts-seg" + (p ? " wo-ts-painted" : "");
      if (p) {
        const style = TS_STYLES.indexOf(p.style) !== -1 ? p.style : "solid";
        seg.classList.add("wo-ts-s-" + style);
        // Dashed/dotted/double draw as currentColor patterns (CSS); solid
        // fills. color carries the pen color into currentColor either way.
        seg.style.setProperty("color", p.color);
        if (style === "solid") seg.style.setProperty("background-color", p.color);
        else seg.style.removeProperty("background-color");
      } else {
        seg.style.removeProperty("color");
        seg.style.removeProperty("background-color");
      }
    });
  }
  on(styleSel, "change", () => { penFromControls(); });
  on(widthSel, "change", () => { penFromControls(); });
  on(colorIn, "input", () => { penFromControls(); });
  on(grid, "click", (ev) => {
    const seg = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-wo-ts-seg]") : null;
    if (!seg) return;
    penFromControls();
    const key = seg.getAttribute("data-wo-ts-seg");
    if (state.painted.has(key)) state.painted.delete(key);
    else if (state.pen.style !== "none") state.painted.set(key, Object.assign({}, state.pen));
    paint();
    fire();
  });
  const clearBtn = q(root, "[data-wo-ts-clear]")[0];
  const allBtn = q(root, "[data-wo-ts-all]")[0];
  on(clearBtn, "click", () => handle.clearAll());
  on(allBtn, "click", () => handle.setAll());
  paint();
  return handle;
}

// ---------------------------------------------------------------------------
// Widget 2: hsbColorPicker — OO common/lib/component/HSBColorPicker.js port.
// H/S/B sliders + hex entry + live swatch; model state {h,s,b}.
// ---------------------------------------------------------------------------
export function hsbColorPicker(root, opts = {}) {
  const state = { h: clamp(opts.h == null ? 210 : opts.h, 0, 360), s: clamp(opts.s == null ? 80 : opts.s, 0, 100), b: clamp(opts.b == null ? 90 : opts.b, 0, 100) };
  const fromColor = hexToHsb(opts.color);
  if (fromColor) { state.h = fromColor.h; state.s = fromColor.s; state.b = fromColor.b; }
  const handle = {
    widget: "hsbColorPicker",
    el: null,
    getValue() { return { hex: hsbToHex(state.h, state.s, state.b), h: state.h, s: state.s, b: state.b }; },
    setValue(color) {
      const hsb = typeof color === "object" && color ? color : hexToHsb(color);
      if (!hsb) return handle;
      state.h = clamp(hsb.h == null ? state.h : hsb.h, 0, 360);
      state.s = clamp(hsb.s == null ? state.s : hsb.s, 0, 100);
      state.b = clamp(hsb.b == null ? state.b : hsb.b, 0, 100);
      paint();
      fire();
      return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
    if (typeof CustomEvent === "function" && mounted && typeof root.dispatchEvent === "function") {
      try {
        root.dispatchEvent(new CustomEvent("wo-dialog-change", { detail: { widget: "hsbColorPicker", value: handle.getValue() } }));
      } catch (err) { /* headless */ }
    }
  }
  if (!mounted) return handle; // headless: pure model only
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);

  root.setAttribute("data-wo-widget-root", "hsbColorPicker");
  const slider = (key, min, max, val, labelKey, label) =>
    '<label class="wo-hsb-slider"><span data-i18n="' + labelKey + '">' + escHtml(label) + "</span>" +
    '<input type="range" min="' + min + '" max="' + max + '" value="' + val + '" data-wo-hsb-' + key +
    ' aria-label="' + escHtml(tr(labelKey, label)) + '" /></label>';
  root.innerHTML =
    '<div class="wo-hsb-preview-row">' +
      '<span class="wo-hsb-swatch" data-wo-hsb-swatch aria-hidden="true"></span>' +
      '<label class="wo-hsb-hexwrap"><span data-i18n="Widget.HSB.Hex">' + escHtml(tr("Widget.HSB.Hex", "Hex value")) + "</span>" +
      '<input type="text" class="wo-hsb-hex" data-wo-hsb-hex maxlength="7" spellcheck="false" aria-label="' + escHtml(tr("Widget.HSB.Hex", "Hex value")) + '" /></label>' +
    "</div>" +
    slider("h", 0, 360, state.h, "Widget.HSB.Hue", tr("Widget.HSB.Hue", "Hue")) +
    slider("s", 0, 100, state.s, "Widget.HSB.Saturation", tr("Widget.HSB.Saturation", "Saturation")) +
    slider("b", 0, 100, state.b, "Widget.HSB.Brightness", tr("Widget.HSB.Brightness", "Brightness")) +
    '<span class="wo-hsb-preview-label" data-i18n="Widget.HSB.Preview">' + escHtml(tr("Widget.HSB.Preview", "Preview")) + "</span>";
  handle.el = root;

  const swatch = q(root, "[data-wo-hsb-swatch]")[0];
  const hexIn = q(root, "[data-wo-hsb-hex]")[0];
  const hIn = q(root, "[data-wo-hsb-h]")[0];
  const sIn = q(root, "[data-wo-hsb-s]")[0];
  const bIn = q(root, "[data-wo-hsb-b]")[0];

  function paint() {
    if (!mounted) return; // headless: state only
    const hex = hsbToHex(state.h, state.s, state.b);
    if (swatch) swatch.style.setProperty("background-color", hex);
    if (hexIn && document.activeElement !== hexIn) hexIn.value = hex;
    if (hIn && hIn.value !== String(state.h)) hIn.value = String(state.h);
    if (sIn && sIn.value !== String(state.s)) sIn.value = String(state.s);
    if (bIn && bIn.value !== String(state.b)) bIn.value = String(state.b);
  }
  on(hIn, "input", () => { state.h = clamp(hIn.value, 0, 360); paint(); fire(); });
  on(sIn, "input", () => { state.s = clamp(sIn.value, 0, 100); paint(); fire(); });
  on(bIn, "input", () => { state.b = clamp(bIn.value, 0, 100); paint(); fire(); });
  on(hexIn, "change", () => {
    const hsb = hexToHsb(hexIn.value);
    if (hsb) { state.h = hsb.h; state.s = hsb.s; state.b = hsb.b; paint(); fire(); }
    else paint(); // restore the canonical hex for the rejected input
  });
  paint();
  return handle;
}

// ---------------------------------------------------------------------------
// Widget 3: multiSliderGradient — OO common/lib/component/MultiSliderGradient
// .js port. Sorted stop list [{offset 0-100, color}], draggable thumbs, add a
// stop by clicking the track (or the add button), remove the selected stop.
// ---------------------------------------------------------------------------
export function multiSliderGradient(root, opts = {}) {
  const state = {
    stops: (Array.isArray(opts.stops) && opts.stops.length >= 2
      ? opts.stops.map((s) => ({ offset: clamp(s.offset, 0, 100), color: s.color || "#000000" }))
      : [{ offset: 0, color: opts.color || "#4a6cf7" }, { offset: 100, color: "#ffffff" }]),
    selected: 0,
  };
  state.stops.sort((a, b) => a.offset - b.offset);
  const handle = {
    widget: "multiSliderGradient",
    el: null,
    getValue() { return state.stops.map((s) => ({ offset: s.offset, color: s.color })); },
    setValue(stops) {
      if (!Array.isArray(stops) || stops.length < 1) return handle;
      state.stops = stops.map((s) => ({ offset: clamp(s.offset, 0, 100), color: s.color || "#000000" })).sort((a, b) => a.offset - b.offset);
      state.selected = 0;
      rebuild();
      fire();
      return handle;
    },
    addStop(offset, color) {
      const off = clamp(offset, 0, 100);
      const col = color || state.stops[Math.min(state.selected, state.stops.length - 1)].color;
      const i = state.stops.findIndex((s) => s.offset >= off);
      const at = i === -1 ? state.stops.length : i;
      state.stops.splice(at, 0, { offset: off, color: col });
      state.selected = at;
      rebuild();
      fire();
      return handle;
    },
    removeStop(index) {
      if (state.stops.length <= 2) return handle; // a gradient needs ≥ 2 stops
      const i = index == null ? state.selected : clamp(index, 0, state.stops.length - 1);
      state.stops.splice(i, 1);
      state.selected = Math.min(state.selected, state.stops.length - 1);
      rebuild();
      fire();
      return handle;
    },
    selectStop(index) {
      state.selected = clamp(index, 0, state.stops.length - 1);
      paintSelection();
      return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
    if (typeof CustomEvent === "function" && mounted && typeof root.dispatchEvent === "function") {
      try {
        root.dispatchEvent(new CustomEvent("wo-dialog-change", { detail: { widget: "multiSliderGradient", value: handle.getValue() } }));
      } catch (err) { /* headless */ }
    }
  }
  if (!mounted) return handle; // headless: pure model only
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);

  root.setAttribute("data-wo-widget-root", "multiSliderGradient");
  root.innerHTML =
    '<div class="wo-grad-track" data-wo-grad-track role="slider" aria-label="gradient stops" tabindex="0"></div>' +
    '<div class="wo-grad-controls">' +
      '<label class="wo-grad-colorwrap"><span data-i18n="Widget.Gradient.Color">' + escHtml(tr("Widget.Gradient.Color", "Stop color")) + "</span>" +
      '<input type="color" data-wo-grad-color aria-label="' + escHtml(tr("Widget.Gradient.Color", "Stop color")) + '" /></label>' +
      '<label class="wo-grad-offwrap"><span data-i18n="Widget.Gradient.Offset">' + escHtml(tr("Widget.Gradient.Offset", "Offset (%)")) + "</span>" +
      '<input type="number" min="0" max="100" data-wo-grad-offset aria-label="' + escHtml(tr("Widget.Gradient.Offset", "Offset (%)")) + '" /></label>' +
      '<button type="button" class="wo-grad-btn" data-wo-grad-add data-i18n="Widget.Gradient.AddStop">' + escHtml(tr("Widget.Gradient.AddStop", "Add stop")) + "</button>" +
      '<button type="button" class="wo-grad-btn" data-wo-grad-remove data-i18n="Widget.Gradient.RemoveStop">' + escHtml(tr("Widget.Gradient.RemoveStop", "Remove stop")) + "</button>" +
    "</div>";
  handle.el = root;

  const track = q(root, "[data-wo-grad-track]")[0];
  const colorIn = q(root, "[data-wo-grad-color]")[0];
  const offIn = q(root, "[data-wo-grad-offset]")[0];
  const addBtn = q(root, "[data-wo-grad-add]")[0];
  const remBtn = q(root, "[data-wo-grad-remove]")[0];

  function cssGradient() {
    return "linear-gradient(to right," + state.stops.map((s) => s.color + " " + s.offset + "%").join(",") + ")";
  }
  function paintSelection() {
    if (!mounted) return; // headless: state only
    const stop = state.stops[state.selected];
    if (colorIn) colorIn.value = stop.color;
    if (offIn) offIn.value = String(Math.round(stop.offset));
    q(track, "[data-wo-grad-thumb]").forEach((th, i) => {
      th.setAttribute("aria-selected", i === state.selected ? "true" : "false");
      th.className = "wo-grad-thumb" + (i === state.selected ? " wo-grad-selected" : "");
    });
  }
  function paint() {
    if (!mounted) return; // headless: state only
    track.style.setProperty("background", cssGradient());
    // Thumbs rebuild only when the stop count changes; drag updates left%.
    const thumbs = q(track, "[data-wo-grad-thumb]");
    if (thumbs.length !== state.stops.length) { rebuild(); return; }
    state.stops.forEach((s, i) => {
      thumbs[i].style.setProperty("left", s.offset + "%");
      thumbs[i].setAttribute("aria-valuenow", String(Math.round(s.offset)));
    });
    paintSelection();
  }
  function rebuild() {
    if (!mounted) return; // headless: state only
    track.innerHTML = state.stops.map((s, i) =>
      '<button type="button" class="wo-grad-thumb" data-wo-grad-thumb="' + i + '" aria-selected="' + (i === state.selected) + '"' +
      ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(s.offset) + '" style="left:' + s.offset + '%"></button>'
    ).join("");
    paint();
  }
  function offsetFromEvent(ev) {
    if (!track || typeof track.getBoundingClientRect !== "function") return null;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return null;
    return clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
  }
  on(track, "pointerdown", (ev) => {
    const thumb = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-wo-grad-thumb]") : null;
    if (thumb) {
      state.selected = Number(thumb.getAttribute("data-wo-grad-thumb")) || 0;
      paintSelection();
      if (typeof thumb.setPointerCapture === "function") {
        try { thumb.setPointerCapture(ev.pointerId); } catch (err) { /* headless */ }
      }
      const move = (mv) => {
        const off = offsetFromEvent(mv);
        if (off == null) return;
        state.stops[state.selected].offset = off;
        paint();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        fire();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      ev.preventDefault();
      return;
    }
    // Empty-track click inserts a stop at that offset (OO behavior).
    const off = offsetFromEvent(ev);
    if (off != null) handle.addStop(off);
  });
  on(colorIn, "input", () => {
    if (!state.stops[state.selected]) return;
    state.stops[state.selected].color = colorIn.value;
    paint();
    fire();
  });
  on(offIn, "change", () => {
    if (!state.stops[state.selected]) return;
    state.stops[state.selected].offset = clamp(offIn.value, 0, 100);
    state.stops.sort((a, b) => a.offset - b.offset);
    state.selected = state.stops.findIndex((s) => Math.round(s.offset) === Math.round(clamp(offIn.value, 0, 100)));
    if (state.selected === -1) state.selected = 0;
    paint();
    fire();
  });
  on(addBtn, "click", () => {
    const cur = state.stops[state.selected] || state.stops[0];
    handle.addStop(clamp((cur ? cur.offset : 50) + 10, 0, 100));
  });
  on(remBtn, "click", () => handle.removeStop());
  rebuild();
  return handle;
}

// ---------------------------------------------------------------------------
// Widget 4: roleList — FX-U2 roles manager list (RolesManagerDlg body).
// Each role renders as a selectable chip (palette swatch + name + assignee);
// the model keeps {roles, selected} so the headless (Node) half works like
// the other factories: getValue()/setValue()/select() without a DOM.
// ---------------------------------------------------------------------------
const FF_FILL_MODES = ["any", "role"];

function ffNormRoles(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r.id === "string")
    .map((r) => ({ id: r.id, name: String(r.name || ""), color: String(r.color || ""), user: String(r.user || "") }));
}
function ffNormFields(list) {
  return (Array.isArray(list) ? list : [])
    .filter((f) => f && typeof f.key === "string")
    .map((f, i) => ({
      key: f.key,
      index: typeof f.index === "number" ? f.index : i,
      type: String(f.type || "text"),
      label: String(f.label == null ? f.key : f.label),
      role: String(f.role || ""),
      required: f.required === true,
      fillMode: FF_FILL_MODES.indexOf(f.fillMode) !== -1 ? f.fillMode : "any",
    }));
}

export function roleList(root, opts = {}) {
  const state = { roles: ffNormRoles(opts.roles), selected: "" };
  const handle = {
    widget: "roleList",
    el: null,
    getValue() {
      return { roles: state.roles.map((r) => Object.assign({}, r)), selected: state.selected };
    },
    /** Re-sync from the live role list: an array (engine setValue path) or
     *  a previous {roles, selected} blob. A role that vanished deselects. */
    setValue(next) {
      const roles = Array.isArray(next) ? next : (next && Array.isArray(next.roles) ? next.roles : null);
      if (roles) {
        state.roles = ffNormRoles(roles);
        if (state.selected && !state.roles.some((r) => r.id === state.selected)) state.selected = "";
      }
      if (next && !Array.isArray(next) && typeof next.selected === "string") {
        state.selected = state.roles.some((r) => r.id === next.selected) ? next.selected : "";
      }
      paint();
      fire();
      return handle;
    },
    select(id) {
      state.selected = state.roles.some((r) => r.id === id) ? String(id) : "";
      paint();
      fire();
      return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
    if (typeof CustomEvent === "function" && mounted && typeof root.dispatchEvent === "function") {
      try {
        root.dispatchEvent(new CustomEvent("wo-dialog-change", { detail: { widget: "roleList", value: handle.getValue() } }));
      } catch (err) { /* headless */ }
    }
  }
  if (!mounted) return handle; // headless: pure model only
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);

  root.setAttribute("data-wo-widget-root", "roleList");
  function paint() {
    if (!mounted) return;
    const none = state.roles.length === 0;
    root.innerHTML = none
      ? '<span class="wo-role-none" data-i18n="Widget.RolesList.None">' + escHtml(tr("Widget.RolesList.None", "No roles yet")) + "</span>"
      : '<div class="wo-role-list" role="listbox" aria-label="' + escHtml(tr("Dialog.Roles.Section", "Roles")) + '">' +
        state.roles.map((r) =>
          '<button type="button" class="wo-role-chip' + (r.id === state.selected ? " wo-role-selected" : "") + '"' +
          ' data-wo-role="' + escHtml(r.id) + '" role="option" aria-selected="' + (r.id === state.selected) + '">' +
            '<span class="wo-role-swatch" style="background-color:#' + escHtml(r.color) + '" aria-hidden="true"></span>' +
            '<span class="wo-role-name">' + escHtml(r.name) + "</span>" +
            '<span class="wo-role-user">' + (r.user
              ? escHtml(tr("Widget.RolesList.AssignedTo", "Assigned to") + ": " + r.user)
              : "") + "</span>" +
          "</button>"
        ).join("") + "</div>";
  }
  on(root, "click", (ev) => {
    const chip = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-wo-role]") : null;
    if (!chip) return;
    handle.select(chip.getAttribute("data-wo-role"));
  });
  paint();
  return handle;
}

// ---------------------------------------------------------------------------
// Widget 5: roleDeleteInfo — RoleDeleteDlg confirm blurb. Shows the role
// about to be removed (swatch + name + assignee) so the OK is informed.
// ---------------------------------------------------------------------------
export function roleDeleteInfo(root, opts = {}) {
  let role = opts.role && typeof opts.role === "object" ? Object.assign({}, opts.role) : null;
  const handle = {
    widget: "roleDeleteInfo",
    el: null,
    getValue() { return role ? Object.assign({}, role) : null; },
    setValue(next) {
      role = next && typeof next.id === "string" ? { id: next.id, name: String(next.name || ""), color: String(next.color || ""), user: String(next.user || "") } : null;
      paint();
      fire();
      return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
  }
  if (!mounted) return handle;
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);
  root.setAttribute("data-wo-widget-root", "roleDeleteInfo");
  function paint() {
    if (!mounted) return;
    root.innerHTML = role
      ? '<div class="wo-role-chip wo-role-chip-static">' +
          '<span class="wo-role-swatch" style="background-color:#' + escHtml(role.color) + '" aria-hidden="true"></span>' +
          '<span class="wo-role-name">' + escHtml(role.name) + "</span>" +
          '<span class="wo-role-user">' + (role.user
            ? escHtml(tr("Widget.RolesList.AssignedTo", "Assigned to") + ": " + role.user)
            : "") + "</span>" +
        "</div>" +
        '<p class="wo-role-delete-confirm" data-i18n="Widget.RoleDelete.Confirm">' +
          escHtml(tr("Widget.RoleDelete.Confirm", "Delete this role? Fields keep their fills.")) + "</p>"
      : "";
  }
  paint();
  return handle;
}

// ---------------------------------------------------------------------------
// Widget 6: formFields — FX-U2 FormSettings per-field table. One row per
// span.form-field: label + role (select from the document's roles) +
// required (checkbox) + filling mode (select). Model: {fields, roles,
// selected(index)} — patch()/select()/setValue() work headless like the
// other factories.
// ---------------------------------------------------------------------------
export function formFields(root, opts = {}) {
  const state = {
    fields: ffNormFields(opts.fields),
    roles: ffNormRoles(opts.roles),
    selected: (typeof opts.selected === "number" && opts.selected >= 0 && opts.selected < (opts.fields || []).length) ? opts.selected : null,
  };
  const handle = {
    widget: "formFields",
    el: null,
    getValue() {
      return {
        fields: state.fields.map((f) => Object.assign({}, f)),
        roles: state.roles.map((r) => Object.assign({}, r)),
        selected: state.selected,
      };
    },
    /** Re-sync from the document: an array of fields, or a previous
     *  {fields, roles} blob. Selection resets (the rows rebuild). */
    setValue(next) {
      const fields = Array.isArray(next) ? next : (next && Array.isArray(next.fields) ? next.fields : null);
      const roles = next && !Array.isArray(next) && Array.isArray(next.roles) ? next.roles : null;
      if (fields) {
        state.fields = ffNormFields(fields);
        state.selected = null;
      }
      if (roles) state.roles = ffNormRoles(roles);
      paint();
      fire();
      return handle;
    },
    /** Patch one field by key. Unknown role ids are rejected; clearing the
     *  role degrades a "role" filling mode back to "any" (a role mode
     *  without a role is meaningless). */
    patch(key, patchObj) {
      const field = state.fields.find((f) => f.key === key);
      if (!field || !patchObj || typeof patchObj !== "object") return handle;
      if (Object.prototype.hasOwnProperty.call(patchObj, "role")) {
        const v = String(patchObj.role == null ? "" : patchObj.role);
        if (v === "" || state.roles.some((r) => r.id === v)) field.role = v;
      }
      if (Object.prototype.hasOwnProperty.call(patchObj, "required")) {
        field.required = patchObj.required === true || patchObj.required === "true";
      }
      if (Object.prototype.hasOwnProperty.call(patchObj, "fillMode")) {
        if (FF_FILL_MODES.indexOf(patchObj.fillMode) !== -1) field.fillMode = patchObj.fillMode;
      }
      if (!field.role && field.fillMode === "role") field.fillMode = "any";
      paint();
      fire();
      return handle;
    },
    select(index) {
      state.selected = (typeof index === "number" && index >= 0 && index < state.fields.length) ? index : null;
      paint();
      fire();
      return handle;
    },
    destroy() { if (root && root.innerHTML !== undefined) root.innerHTML = ""; },
  };
  const mounted = !!root && hasDom();
  function fire() {
    if (typeof opts.onChange === "function") opts.onChange(handle.getValue());
    if (typeof CustomEvent === "function" && mounted && typeof root.dispatchEvent === "function") {
      try {
        root.dispatchEvent(new CustomEvent("wo-dialog-change", { detail: { widget: "formFields", value: handle.getValue() } }));
      } catch (err) { /* headless */ }
    }
  }
  if (!mounted) return handle; // headless: pure model only
  const t = opts.t;
  const tr = (k, d) => (t && typeof t === "function" ? t(k) : d);

  root.setAttribute("data-wo-widget-root", "formFields");
  function paint() {
    if (!mounted) return;
    const roleOptions = (field) =>
      '<option value=""' + (field.role === "" ? " selected" : "") + ">" + escHtml(tr("Widget.FormFields.None", "Unassigned")) + "</option>" +
      state.roles.map((r) =>
        '<option value="' + escHtml(r.id) + '"' + (field.role === r.id ? " selected" : "") + ">" + escHtml(r.name) + "</option>"
      ).join("");
    const fillOptions = (field) =>
      '<option value="any"' + (field.fillMode === "any" ? " selected" : "") + ">" + escHtml(tr("Widget.FormFields.FillModeAny", "Anyone")) + "</option>" +
      '<option value="role"' + (field.fillMode === "role" ? " selected" : "") + ">" + escHtml(tr("Widget.FormFields.FillModeRole", "Role only")) + "</option>";
    root.innerHTML = state.fields.length === 0
      ? '<span class="wo-form-fields-empty" data-i18n="Status.NoFormFields">' + escHtml(tr("Status.NoFormFields", "No form fields in the document")) + "</span>"
      : '<div class="wo-form-fields" role="table" aria-label="' + escHtml(tr("Dialog.FormSettings.Section", "Form fields")) + '">' +
        '<div class="wo-form-field-head" role="row" aria-hidden="true">' +
          '<span data-i18n="Dialog.FormSettings.Section">' + escHtml(tr("Dialog.FormSettings.Section", "Form fields")) + "</span>" +
          '<span data-i18n="Widget.FormFields.Role">' + escHtml(tr("Widget.FormFields.Role", "Role")) + "</span>" +
          '<span data-i18n="Widget.FormFields.Required">' + escHtml(tr("Widget.FormFields.Required", "Required")) + "</span>" +
          '<span data-i18n="Widget.FormFields.FillMode">' + escHtml(tr("Widget.FormFields.FillMode", "Filling mode")) + "</span>" +
        "</div>" +
        state.fields.map((f, i) =>
          '<div class="wo-form-field-row' + (i === state.selected ? " wo-form-field-selected" : "") + '" data-wo-field="' + escHtml(f.key) + '" role="row">' +
            '<span class="wo-form-field-label" role="cell">' + escHtml(f.label) + "</span>" +
            '<select class="wo-form-field-role" data-wo-field-role="' + escHtml(f.key) + '" role="cell" aria-label="' + escHtml(tr("Widget.FormFields.Role", "Role")) + '">' + roleOptions(f) + "</select>" +
            '<input type="checkbox" class="wo-form-field-required" data-wo-field-required="' + escHtml(f.key) + '"' + (f.required ? " checked" : "") + ' role="cell" aria-label="' + escHtml(tr("Widget.FormFields.Required", "Required")) + '" />' +
            '<select class="wo-form-field-fillmode" data-wo-field-fillmode="' + escHtml(f.key) + '" role="cell" aria-label="' + escHtml(tr("Widget.FormFields.FillMode", "Filling mode")) + '">' + fillOptions(f) + "</select>" +
          "</div>"
        ).join("") + "</div>";
  }
  on(root, "change", (ev) => {
    const target = ev && ev.target;
    if (!target || typeof target.getAttribute !== "function") return;
    const roleKey = target.getAttribute("data-wo-field-role");
    if (roleKey) { handle.patch(roleKey, { role: target.value }); return; }
    const reqKey = target.getAttribute("data-wo-field-required");
    if (reqKey) { handle.patch(reqKey, { required: target.checked }); return; }
    const fillKey = target.getAttribute("data-wo-field-fillmode");
    if (fillKey) handle.patch(fillKey, { fillMode: target.value });
  });
  on(root, "click", (ev) => {
    const row = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-wo-field]") : null;
    if (!row) return;
    const key = row.getAttribute("data-wo-field");
    const idx = state.fields.findIndex((f) => f.key === key);
    if (idx !== -1) handle.select(idx);
  });
  paint();
  return handle;
}

/** Spec row type "custom" → widget factory registry. */
export const WO_CUSTOM_WIDGETS = { tableStyler, hsbColorPicker, multiSliderGradient, roleList, roleDeleteInfo, formFields };

// ---------------------------------------------------------------------------
// WoDialogEngine
// ---------------------------------------------------------------------------
const ROW_CONTROL_TYPES = { text: 1, number: 1, select: 1, checkbox: 1, color: 1, range: 1 };

export class WoDialogEngine {
  constructor(opts = {}) {
    this.opts = opts || {};
    this.dialogs = new Map(); // id → handle
    this.widgets = [];        // mounted custom-widget handles
    this._valueSnapshots = new Map(); // id → {rowKey: value}
    this._lastFocus = null;
  }
  /** Resolve the translation fn: injected t → editor.js seam → own instance. */
  t() {
    if (this.opts.t) return this.opts.t;
    if (typeof window !== "undefined") {
      if (window.__WO_I18N_T__) return window.__WO_I18N_T__;
      if (window.createI18n) {
        const lng = window.detectLocale ? window.detectLocale() : "en";
        return window.createI18n({ lng: lng });
      }
    }
    return null;
  }
  /**
   * Render a dialog spec to the exact HTML a static index.html dialog uses.
   * Pure string building — the canonical serialization build() mounts, and
   * the seam Node tests assert against.
   */
  renderSpec(spec) {
    if (!spec || typeof spec.id !== "string" || !/^[a-z][a-z0-9-]*$/i.test(spec.id)) {
      throw new TypeError("WoDialogEngine.renderSpec: spec.id (css-identifier-like string) is required");
    }
    const id = spec.id;
    const sections = Array.isArray(spec.sections) ? spec.sections : [];
    const body = sections.map((section, si) => this.renderSection(spec, section, si)).join("");
    const okCmd = spec.okCmd || "dialog." + id + ".ok";
    const widthStyle = spec.width ? ' style="max-width:' + escHtml(spec.width) + '"' : "";
    const titleKey = spec.titleKey || "Dialog.Title";
    const titleText = spec.title || "Dialog";
    return (
      '<div id="' + escHtml(id) + '" class="dialog-overlay wo-engine-dialog" role="dialog" aria-modal="true" aria-labelledby="' + escHtml(id) + '-title" data-wo-dialog="' + escHtml(id) + '">' +
        '<div class="dialog wo-dlg-panel"' + widthStyle + ">" +
          '<h3 id="' + escHtml(id) + '-title" data-i18n="' + escHtml(titleKey) + '">' + escHtml(titleText) + "</h3>" +
          body +
          '<div class="dialog-actions wo-dlg-actions">' +
            '<button type="button" id="' + escHtml(id) + '-cancel" class="wo-dlg-cancel" data-wo-cancel="1" data-i18n="Dialog.Cancel">Cancel</button>' +
            '<button type="button" id="' + escHtml(id) + '-ok" class="primary wo-dlg-ok" data-wo-ok="1" data-wo-cmd="' + escHtml(okCmd) + '" data-i18n="Dialog.Apply">Apply</button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }
  renderSection(spec, section, si) {
    const rows = Array.isArray(section && section.rows) ? section.rows : [];
    const inner = rows.map((row, ri) => this.renderRow(spec, row, si, ri)).join("");
    const secTitleKey = section.titleKey || "Dialog.Title";
    return (
      '<fieldset class="wo-dlg-section" data-wo-section="' + si + '">' +
        '<legend data-i18n="' + escHtml(secTitleKey) + '">' + escHtml(section && section.title ? section.title : "Dialog") + "</legend>" +
        inner +
      "</fieldset>"
    );
  }
  renderRow(spec, row, si, ri) {
    if (!row || typeof row.key === "undefined") return "";
    const id = spec.id + "-" + row.key;
    const labelKey = row.labelKey || "Dialog.Title";
    const labelText = row.label == null ? row.key : row.label;
    const cmdAttr = row.cmd ? ' data-wo-cmd="' + escHtml(row.cmd) + '"' : "";
    const valueAttr = row.value === undefined || row.value === null ? "" : ' value="' + escHtml(row.value) + '"';
    const i18nAttr = row.labelKey ? ' data-i18n="' + escHtml(labelKey) + '"' : "";
    if (row.type === "button") {
      return (
        '<div class="dialog-field wo-dlg-row wo-dlg-row-button" data-wo-row="' + escHtml(row.key) + '">' +
          '<button type="button" id="' + escHtml(id) + '" class="wo-dlg-btn" data-wo-key="' + escHtml(row.key) + '"' + cmdAttr +
          (row.value === undefined || row.value === null ? "" : ' data-wo-value="' + escHtml(row.value) + '"') +
          i18nAttr + ">" + escHtml(labelText) + "</button>" +
        "</div>"
      );
    }
    if (row.type === "custom") {
      return (
        '<div class="dialog-field wo-dlg-row wo-dlg-row-custom" data-wo-row="' + escHtml(row.key) + '">' +
          '<label class="wo-dlg-custom-label" for="' + escHtml(id) + '"' + i18nAttr + ">" + escHtml(labelText) + "</label>" +
          '<div id="' + escHtml(id) + '" class="wo-dlg-custom" data-wo-key="' + escHtml(row.key) + '" data-wo-widget="' + escHtml(row.widget || "") + '"' + cmdAttr + "></div>" +
        "</div>"
      );
    }
    if (!ROW_CONTROL_TYPES[row.type]) return ""; // unknown type: render nothing
    let control = "";
    if (row.type === "select") {
      const opts = Array.isArray(row.options) ? row.options : [];
      const current = row.value === undefined ? (opts[0] && opts[0].value) : row.value;
      control =
        '<select id="' + escHtml(id) + '" name="' + escHtml(row.key) + '" data-wo-key="' + escHtml(row.key) + '"' + cmdAttr + ">" +
        opts.map((o) =>
          '<option value="' + escHtml(o.value) + '"' + (String(o.value) === String(current) ? " selected" : "") +
          (o.labelKey ? ' data-i18n="' + escHtml(o.labelKey) + '"' : "") + ">" + escHtml(o.label == null ? o.value : o.label) + "</option>"
        ).join("") +
        "</select>";
    } else if (row.type === "checkbox") {
      control =
        '<input id="' + escHtml(id) + '" name="' + escHtml(row.key) + '" type="checkbox" data-wo-key="' + escHtml(row.key) + '"' + cmdAttr +
        (row.value ? " checked" : "") + " />";
    } else {
      const attrs = [
        'type="' + row.type + '"',
        row.min !== undefined ? ' min="' + escHtml(row.min) + '"' : "",
        row.max !== undefined ? ' max="' + escHtml(row.max) + '"' : "",
        row.step !== undefined ? ' step="' + escHtml(row.step) + '"' : "",
        row.placeholder !== undefined ? ' placeholder="' + escHtml(row.placeholder) + '"' : "",
      ].join("");
      control =
        '<input id="' + escHtml(id) + '" name="' + escHtml(row.key) + '" ' + attrs +
        ' data-wo-key="' + escHtml(row.key) + '"' + cmdAttr + valueAttr + " />";
    }
    return (
      '<div class="dialog-field wo-dlg-row wo-dlg-row-' + row.type + '" data-wo-row="' + escHtml(row.key) + '">' +
        '<label for="' + escHtml(id) + '"' + i18nAttr + ">" + escHtml(labelText) + "</label>" +
        control +
      "</div>"
    );
  }
  /** Register a built dialog id with editor.js's DIALOG_IDS (Tab trap/Esc). */
  registerDialogId(id) {
    if (typeof window === "undefined") return false;
    if (typeof window.woRegisterDialogId === "function") {
      try { return !!window.woRegisterDialogId(id); } catch (err) { return false; }
    }
    // editor.js has not booted yet: queue for its registration-seam drain.
    if (!Array.isArray(window.__WO_PENDING_DIALOG_IDS__)) window.__WO_PENDING_DIALOG_IDS__ = [];
    if (window.__WO_PENDING_DIALOG_IDS__.indexOf(id) === -1) window.__WO_PENDING_DIALOG_IDS__.push(id);
    return true;
  }
  /**
   * Build the dialog DOM from spec and register it. Returns a handle:
   * { id, el, spec, open, close, getValues, setValue, destroy }.
   * Requires a DOM; without one (Node) use renderSpec() instead.
   */
  build(spec) {
    if (!hasDom()) throw new Error("WoDialogEngine.build: no DOM available (use renderSpec headless)");
    if (!spec || typeof spec.id !== "string" || !/^[a-z][a-z0-9-]*$/i.test(spec.id)) {
      throw new TypeError("WoDialogEngine.build: spec.id (css-identifier-like string) is required");
    }
    if (this.dialogs.has(spec.id)) throw new Error('WoDialogEngine.build: dialog "' + spec.id + '" already built');
    const doc = document;
    const t = this.t();
    if (t) seedEngineStrings(t);

    const overlay = doc.createElement("div");
    overlay.setAttribute("id", spec.id);
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", spec.id + "-title");
    overlay.setAttribute("data-wo-dialog", spec.id);
    overlay.className = "dialog-overlay wo-engine-dialog";
    // renderSpec output minus the outer overlay div == the .dialog panel.
    overlay.appendChild(this._panelFromHtml(spec));
    this._mount(spec, overlay, t);
    if (t && typeof window !== "undefined" && window.applyTranslations) {
      try { window.applyTranslations(overlay, t); } catch (err) { /* i18n optional */ }
    }
    this._wire(spec, overlay);
    const mount = this.opts.mount || (doc.body || doc);
    if (mount && typeof mount.appendChild === "function") mount.appendChild(overlay);
    this.registerDialogId(spec.id);

    const engine = this;
    const handle = {
      id: spec.id,
      spec: spec,
      el: overlay,
      open() { engine.open(spec.id); return handle; },
      close() { engine.close(spec.id); return handle; },
      getValues() { return engine.getValues(spec.id); },
      setValue(key, value) { engine.setValue(spec.id, key, value); return handle; },
      destroy() { engine.destroy(spec.id); },
    };
    this.dialogs.set(spec.id, handle);
    return handle;
  }
  /** Mount custom-widget factories into their data-wo-widget mount points. */
  _mount(spec, overlay, t) {
    const found = q(overlay, "[data-wo-widget]");
    found.forEach((mountEl) => {
      const name = mountEl.getAttribute("data-wo-widget");
      const factory = WO_CUSTOM_WIDGETS[name];
      if (!factory) return;
      const key = mountEl.getAttribute("data-wo-key");
      const row = this._findRow(spec, key) || {};
      const instance = factory(mountEl, {
        t: t,
        color: row.value && typeof row.value === "object" ? undefined : row.value,
        stops: Array.isArray(row.value) ? row.value : undefined,
        borders: Array.isArray(row.borders) ? row.borders : undefined,
        style: row.style, width: row.width,
        onChange: (value) => {
          this._values(spec.id)[key] = value;
          if (row.cmd) this._emit(row.cmd, typeof value === "string" ? value : JSON.stringify(value));
        },
      });
      if (instance && typeof instance.getValue === "function") {
        this._values(spec.id)[key] = instance.getValue();
        this.widgets.push(instance);
      }
    });
  }
  /**
   * Delegated behavior: command rows emit wo-command, change/input keep the
   * value snapshot fresh, OK applies the whole dialog as one ledger entry,
   * Cancel closes. Delegation keeps the wiring alive for dialogs whose rows
   * were serialized via innerHTML.
   */
  _wire(spec, overlay) {
    this._valueSnapshots.set(spec.id, this._initialValues(spec));
    const engine = this;
    on(overlay, "click", (ev) => {
      const target = ev && ev.target;
      if (!target || typeof target.getAttribute !== "function") return;
      const hit = typeof target.closest === "function" ? target.closest("[data-wo-cancel],[data-wo-ok],[data-wo-cmd]") : null;
      if (!hit) return;
      if (hit.hasAttribute("data-wo-cancel")) { engine.close(spec.id); return; }
      const cmd = hit.getAttribute("data-wo-cmd") || "";
      if (hit.hasAttribute("data-wo-ok")) {
        engine._emit(cmd, JSON.stringify(engine.getValues(spec.id)));
        return;
      }
      if (!cmd) return;
      engine._emit(cmd, hit.getAttribute("data-wo-value") == null ? null : String(hit.getAttribute("data-wo-value")));
    });
    const syncValue = (ev, emit) => {
      const target = ev && ev.target;
      if (!target || typeof target.getAttribute !== "function") return;
      const key = target.getAttribute("data-wo-key");
      if (!key) return;
      const isCheck = target.getAttribute("type") === "checkbox";
      const value = isCheck ? (target.checked ? "true" : "false") : (target.value == null ? null : String(target.value));
      engine._values(spec.id)[key] = value;
      const cmd = target.getAttribute("data-wo-cmd");
      if (emit && cmd) engine._emit(cmd, value);
    };
    on(overlay, "change", (ev) => syncValue(ev, true));
    on(overlay, "input", (ev) => syncValue(ev, false));
  }
  _panelFromHtml(spec) {
    // renderSpec output minus the outer overlay div == the .dialog panel.
    const doc = document;
    const panel = doc.createElement("div");
    const html = this.renderSpec(spec);
    panel.className = "dialog wo-dlg-panel";
    panel.innerHTML = html.replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
    return panel;
  }
  _findRow(spec, key) {
    const sections = Array.isArray(spec.sections) ? spec.sections : [];
    for (const s of sections) {
      const rows = Array.isArray(s.rows) ? s.rows : [];
      for (const r of rows) if (r && r.key === key) return r;
    }
    return null;
  }
  _initialValues(spec) {
    const values = {};
    const sections = Array.isArray(spec.sections) ? spec.sections : [];
    sections.forEach((s) => {
      (Array.isArray(s && s.rows) ? s.rows : []).forEach((row) => {
        if (!row || row.type === "button") return;
        if (row.type === "custom") return; // filled by the widget factory
        if (row.type === "checkbox") values[row.key] = row.value ? "true" : "false";
        else if (row.type === "select") values[row.key] = row.value === undefined ? (row.options && row.options[0] ? String(row.options[0].value) : null) : String(row.value);
        else values[row.key] = row.value === undefined || row.value === null ? "" : String(row.value);
      });
    });
    return values;
  }
  _values(id) {
    if (!this._valueSnapshots.has(id)) this._valueSnapshots.set(id, {});
    return this._valueSnapshots.get(id);
  }
  /** wo-command bus — the same channel runCommand()/recordCommand() consume. */
  _emit(cmd, value) {
    if (!cmd) return;
    if (typeof this.opts.onCommand === "function") this.opts.onCommand(cmd, value);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: cmd, value: value == null ? null : String(value) } }));
      } catch (err) { /* headless */ }
    }
  }
  get(id) { return this.dialogs.get(id) || null; }
  open(id) {
    const handle = this.dialogs.get(id);
    if (!handle || !handle.el) return false;
    if (typeof document !== "undefined" && document.activeElement) this._lastFocus = document.activeElement;
    handle.el.classList.add("open");
    const ok = q(handle.el, "[data-wo-ok]")[0];
    if (ok && typeof ok.focus === "function") ok.focus();
    return true;
  }
  close(id) {
    const handle = this.dialogs.get(id);
    if (!handle || !handle.el) return false;
    handle.el.classList.remove("open");
    const last = this._lastFocus;
    if (last && typeof last.focus === "function") { try { last.focus(); } catch (err) { /* detached */ } }
    this._lastFocus = null;
    return true;
  }
  isOpen(id) {
    const handle = this.dialogs.get(id);
    return !!(handle && handle.el && handle.el.classList && typeof handle.el.classList.contains === "function" && handle.el.classList.contains("open"));
  }
  closeAll() { Array.from(this.dialogs.keys()).forEach((id) => this.close(id)); }
  getValues(id) { return Object.assign({}, this._values(id)); }
  /**
   * Set one row value: update the value snapshot AND the mounted control
   * (input/select/checkbox) or custom widget instance. P3-U02 uses this to
   * re-sync a dialog from the live document every time it is opened (the OO
   * views re-read their properties on show); the static index.html dialogs
   * hand-write the same sync in their open functions.
   */
  setValue(id, key, value) {
    const str = value === undefined || value === null ? "" : String(value);
    const checked = value === true || value === "true" || value === 1 || value === "1";
    this._values(id)[key] = str;
    const handle = this.dialogs.get(id);
    if (!handle || !handle.el) return;
    q(handle.el, "[data-wo-key]").forEach((ctl) => {
      if (ctl.getAttribute("data-wo-key") !== key) return;
      if (ctl.getAttribute("type") === "checkbox") {
        if ("checked" in ctl) ctl.checked = checked;
      } else if ("value" in ctl) {
        ctl.value = str;
      }
    });
    // Custom-widget rows: route the value through the factory handle (its
    // setValue re-renders and fires its own onChange → snapshot stays hot).
    this.widgets.forEach((w) => {
      if (!w || !w.el || typeof w.setValue !== "function") return;
      if (w.el.getAttribute("data-wo-key") !== key) return;
      let n = w.el.parentElement;
      while (n && n.getAttribute) {
        if (n.getAttribute("data-wo-dialog") === id) {
          try { w.setValue(value); } catch (err) { /* widget may reject */ }
          return;
        }
        n = n.parentElement;
      }
    });
  }
  destroy(id) {
    const handle = this.dialogs.get(id);
    if (!handle) return false;
    this.close(id);
    if (handle.el && typeof handle.el.remove === "function") { try { handle.el.remove(); } catch (err) { /* detached */ } }
    this._valueSnapshots.delete(id);
    this.dialogs.delete(id);
    return true;
  }
}
// Per-dialog value snapshots live on the instance (not in build closures) so
// getValues() works from any reference — see the constructor.

// ---------------------------------------------------------------------------
// P3-U02: consumer dialog specs — the two largest missing OO views hosted
// from the engine above. Spec data only (strings + row descriptors); the
// behavioral half lives in editor.js:
//   - openTableSettingsAdvanced / openImageSettingsAdvanced build+open these
//     (once) and re-sync the rows from the live selection via engine
//     setValue(), mirroring how the OO views re-read properties on show;
//   - runCommand("tableSettingsAdvanced"/"imageSettingsAdvanced") applies the
//     OK payload — one JSON ledger entry per dialog apply (engine invariant).
// OO references: documenteditor/main/app/view/TableSettingsAdvanced.js
// (cell margins/distances, table alignment+indent, text flow around the
// table, TableStyler-driven borders/shading, repeat-as-header, resize
// behavior) and view/ImageSettingsAdvanced.js (size, rotation, text wrapping
// + distances, wrap-boundary entry point, adjust sliders, crop, replace,
// alt text). Crop/adjust are honest CSS approximations (clip-path/filter —
// the WO object model has no raster transform engine); repeat-as-header and
// wrap-around-table are session markers like the banded-rows classes.
// ---------------------------------------------------------------------------
export const TABLE_SETTINGS_ADVANCED_SPEC = {
  id: "table-settings-advanced-dialog",
  title: "Table — advanced settings",
  titleKey: "Dialog.TableAdvanced.Title",
  width: 600,
  okCmd: "tableSettingsAdvanced",
  sections: [
    {
      title: "Table position",
      titleKey: "Dialog.TableAdvanced.Section.Position",
      rows: [
        { type: "select", key: "align", label: "Table alignment", labelKey: "Dialog.TableAdvanced.Align",
          value: "left",
          options: [
            { value: "left", label: "Left", labelKey: "Dialog.Advanced.Left" },
            { value: "center", label: "Center", labelKey: "Dialog.Advanced.Center" },
            { value: "right", label: "Right", labelKey: "Dialog.Advanced.Right" },
          ] },
        { type: "number", key: "indent", label: "Indent from left (cm)", labelKey: "Dialog.TableAdvanced.Indent",
          min: 0, max: 20, step: 0.1, value: 0 },
        { type: "select", key: "wrap", label: "Text wrapping", labelKey: "Dialog.TableAdvanced.Wrap",
          value: "inline",
          options: [
            { value: "inline", label: "Inline (no wrap)", labelKey: "Dialog.TableAdvanced.WrapInline" },
            { value: "around", label: "Around", labelKey: "Dialog.TableAdvanced.WrapAround" },
          ] },
        { type: "checkbox", key: "moveWithText", label: "Move with text", labelKey: "Dialog.TableAdvanced.MoveWithText",
          value: true },
        { type: "checkbox", key: "allowOverlap", label: "Allow overlap", labelKey: "Dialog.TableAdvanced.AllowOverlap",
          value: false },
        { type: "number", key: "distTop", label: "Top (mm)", labelKey: "Dialog.Advanced.DistTop",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distBottom", label: "Bottom (mm)", labelKey: "Dialog.Advanced.DistBottom",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distLeft", label: "Left (mm)", labelKey: "Dialog.Advanced.DistLeft",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distRight", label: "Right (mm)", labelKey: "Dialog.Advanced.DistRight",
          min: 0, max: 500, step: 1, value: 0 },
      ],
    },
    {
      title: "Default cell margins",
      titleKey: "Dialog.TableAdvanced.Section.Margins",
      rows: [
        { type: "number", key: "marginTop", label: "Top (cm)", labelKey: "Dialog.Advanced.MarginTop",
          min: 0, max: 5, step: 0.05, value: 0 },
        { type: "number", key: "marginBottom", label: "Bottom (cm)", labelKey: "Dialog.Advanced.MarginBottom",
          min: 0, max: 5, step: 0.05, value: 0 },
        { type: "number", key: "marginLeft", label: "Left (cm)", labelKey: "Dialog.Advanced.MarginLeft",
          min: 0, max: 5, step: 0.05, value: 0.19 },
        { type: "number", key: "marginRight", label: "Right (cm)", labelKey: "Dialog.Advanced.MarginRight",
          min: 0, max: 5, step: 0.05, value: 0.19 },
      ],
    },
    {
      title: "Borders & shading",
      titleKey: "Dialog.TableAdvanced.Section.Borders",
      rows: [
        // The OO TableStyler port (P3-U01) gets its consumer here: pen +
        // painted-segment value rides in the OK payload.
        { type: "custom", key: "styler", label: "Table borders", labelKey: "Dialog.TableAdvanced.Borders",
          widget: "tableStyler" },
        { type: "color", key: "shade", label: "Fill", labelKey: "Dialog.TableAdvanced.Shade",
          value: "#ffffff" },
      ],
    },
    {
      title: "Rows & behavior",
      titleKey: "Dialog.TableAdvanced.Section.Rows",
      rows: [
        { type: "checkbox", key: "repeatHeader",
          label: "Repeat as header row at the top of each page",
          labelKey: "Dialog.TableAdvanced.RepeatHeader", value: false },
        { type: "checkbox", key: "resizeFit", label: "Resize cells to fit text",
          labelKey: "Dialog.TableAdvanced.ResizeFit", value: true },
      ],
    },
  ],
};

export const IMAGE_SETTINGS_ADVANCED_SPEC = {
  id: "image-settings-advanced-dialog",
  title: "Image — advanced settings",
  titleKey: "Dialog.ImageAdvanced.Title",
  width: 560,
  okCmd: "imageSettingsAdvanced",
  sections: [
    {
      title: "Size",
      titleKey: "Dialog.ImageAdvanced.Section.Size",
      rows: [
        { type: "number", key: "width", label: "Width (px)", labelKey: "Dialog.ImageAdvanced.Width",
          min: 16, max: 10000, step: 1, value: 200 },
        { type: "number", key: "height", label: "Height (px)", labelKey: "Dialog.ImageAdvanced.Height",
          min: 16, max: 10000, step: 1, value: 150 },
        { type: "checkbox", key: "keepRatio", label: "Keep ratio", labelKey: "Dialog.ImageAdvanced.KeepRatio",
          value: true },
      ],
    },
    {
      title: "Rotation",
      titleKey: "Dialog.ImageAdvanced.Section.Rotation",
      rows: [
        { type: "number", key: "angle", label: "Angle (°)", labelKey: "Dialog.ImageAdvanced.Angle",
          min: -180, max: 180, step: 5, value: 0 },
        { type: "button", key: "rotateCw", label: "Rotate 90° clockwise", labelKey: "Dialog.ImageAdvanced.RotateCw",
          cmd: "imageAdvancedRotate", value: "cw" },
        { type: "button", key: "rotateCcw", label: "Rotate 90° counter-clockwise", labelKey: "Dialog.ImageAdvanced.RotateCcw",
          cmd: "imageAdvancedRotate", value: "ccw" },
      ],
    },
    {
      title: "Text wrapping",
      titleKey: "Dialog.ImageAdvanced.Section.Wrap",
      rows: [
        { type: "select", key: "wrap", label: "Wrapping style", labelKey: "Dialog.ImageAdvanced.Wrap",
          value: "wrap-inline",
          options: [
            { value: "wrap-inline", label: "Inline", labelKey: "Dialog.ImageAdvanced.WrapInline" },
            { value: "wrap-square", label: "Square", labelKey: "Dialog.ImageAdvanced.WrapSquare" },
            { value: "wrap-tight", label: "Tight", labelKey: "Dialog.ImageAdvanced.WrapTight" },
            { value: "wrap-through", label: "Through", labelKey: "Dialog.ImageAdvanced.WrapThrough" },
            { value: "wrap-top-and-bottom", label: "Top and bottom", labelKey: "Dialog.ImageAdvanced.WrapTopBottom" },
            { value: "wrap-behind", label: "Behind text", labelKey: "Dialog.ImageAdvanced.WrapBehind" },
            { value: "wrap-front", label: "In front of text", labelKey: "Dialog.ImageAdvanced.WrapFront" },
          ] },
        { type: "number", key: "distTop", label: "Top (mm)", labelKey: "Dialog.Advanced.DistTop",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distBottom", label: "Bottom (mm)", labelKey: "Dialog.Advanced.DistBottom",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distLeft", label: "Left (mm)", labelKey: "Dialog.Advanced.DistLeft",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "number", key: "distRight", label: "Right (mm)", labelKey: "Dialog.Advanced.DistRight",
          min: 0, max: 500, step: 1, value: 0 },
        { type: "button", key: "editWrapBoundary", label: "Edit wrap boundary…",
          labelKey: "Dialog.ImageAdvanced.EditWrapBoundary", cmd: "editWrapBoundary" },
      ],
    },
    {
      title: "Adjust",
      titleKey: "Dialog.ImageAdvanced.Section.Adjust",
      rows: [
        { type: "range", key: "brightness", label: "Brightness (%)", labelKey: "Dialog.ImageAdvanced.Brightness",
          min: 20, max: 200, step: 5, value: 100 },
        { type: "range", key: "contrast", label: "Contrast (%)", labelKey: "Dialog.ImageAdvanced.Contrast",
          min: 20, max: 200, step: 5, value: 100 },
        { type: "range", key: "saturation", label: "Saturation (%)", labelKey: "Dialog.ImageAdvanced.Saturation",
          min: 0, max: 200, step: 5, value: 100 },
      ],
    },
    {
      title: "Crop (%)",
      titleKey: "Dialog.ImageAdvanced.Section.Crop",
      rows: [
        { type: "range", key: "cropTop", label: "Top (%)", labelKey: "Dialog.Advanced.CropTop",
          min: 0, max: 45, step: 1, value: 0 },
        { type: "range", key: "cropBottom", label: "Bottom (%)", labelKey: "Dialog.Advanced.CropBottom",
          min: 0, max: 45, step: 1, value: 0 },
        { type: "range", key: "cropLeft", label: "Left (%)", labelKey: "Dialog.Advanced.CropLeft",
          min: 0, max: 45, step: 1, value: 0 },
        { type: "range", key: "cropRight", label: "Right (%)", labelKey: "Dialog.Advanced.CropRight",
          min: 0, max: 45, step: 1, value: 0 },
      ],
    },
    {
      title: "Replace image",
      titleKey: "Dialog.ImageAdvanced.Section.Replace",
      rows: [
        { type: "text", key: "url", label: "From URL", labelKey: "Dialog.ImageAdvanced.FromUrl",
          placeholder: "https://…" },
        { type: "button", key: "replace", label: "Browse file…", labelKey: "Dialog.ImageAdvanced.Browse",
          cmd: "imageAdvancedReplace" },
      ],
    },
    {
      title: "Alt text",
      titleKey: "Dialog.ImageAdvanced.Section.Alt",
      rows: [
        { type: "text", key: "alt", label: "Description", labelKey: "Dialog.ImageAdvanced.Alt" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// P3-U03: ShapeSettings (documenteditor view/ShapeSettings.js, 2449 lines) —
// the shape style editor the ledger ranks #2 missing: fill (none/solid/
// gradient via the P3-U01 MultiSliderGradient port), line (color/width/style,
// caps/joins, begin/end arrows) and shadow (color/blur/offset), plus the
// geometry checkboxes OO exposes for anchored shapes. The behavioral half
// lives in editor.js (openShapeSettings/applyShapeSettingsAdvanced): the WO
// object model has no OO fill-registry, so fill/line/shadow persist as
// data-shape-* attributes + inline SVG paint attributes (fill/stroke/
// stroke-dasharray) and gradients/shadows are honest CSS approximations
// (linear-gradient background / box-shadow) — same policy as P3-U02's
// crop/adjust approximations for rasters.
// ---------------------------------------------------------------------------
export const SHAPE_SETTINGS_SPEC = {
  id: "shape-settings-dialog",
  title: "Shape — settings",
  titleKey: "Dialog.ShapeAdvanced.Title",
  width: 560,
  okCmd: "shapeSettings",
  sections: [
    {
      title: "Fill",
      titleKey: "Dialog.ShapeAdvanced.Section.Fill",
      rows: [
        { type: "select", key: "fillType", label: "Fill type", labelKey: "Dialog.ShapeAdvanced.FillType",
          value: "solid",
          options: [
            { value: "none", label: "No fill", labelKey: "Dialog.ShapeAdvanced.FillNone" },
            { value: "solid", label: "Solid color", labelKey: "Dialog.ShapeAdvanced.FillSolid" },
            { value: "gradient", label: "Gradient", labelKey: "Dialog.ShapeAdvanced.FillGradient" },
          ], cmd: "shapeFillType" },
        { type: "color", key: "fill", label: "Fill color", labelKey: "Dialog.ShapeAdvanced.FillColor",
          value: "#4a6cf7", cmd: "shapeFillColor" },
        { type: "custom", key: "fillGradient", label: "Gradient stops", labelKey: "Dialog.ShapeAdvanced.Gradient",
          widget: "multiSliderGradient", cmd: "shapeFillGradient" },
        { type: "button", key: "fillCustom", label: "Custom fill color…", labelKey: "Dialog.ShapeAdvanced.CustomColor",
          cmd: "openExtendedColor", value: "shape-fill" },
      ],
    },
    {
      title: "Line",
      titleKey: "Dialog.ShapeAdvanced.Section.Line",
      rows: [
        { type: "color", key: "line", label: "Line color", labelKey: "Dialog.ShapeAdvanced.LineColor",
          value: "#4472c4", cmd: "shapeLineColor" },
        { type: "number", key: "lineWidth", label: "Width (pt)", labelKey: "Dialog.ShapeAdvanced.LineWidth",
          min: 0, max: 12, step: 0.25, value: 2, cmd: "shapeLineWidth" },
        { type: "select", key: "lineStyle", label: "Style", labelKey: "Dialog.ShapeAdvanced.LineStyle",
          value: "solid",
          options: [
            { value: "solid", label: "Solid", labelKey: "Widget.BorderStyle.Solid" },
            { value: "dashed", label: "Dashed", labelKey: "Widget.BorderStyle.Dashed" },
            { value: "dotted", label: "Dotted", labelKey: "Widget.BorderStyle.Dotted" },
            { value: "double", label: "Double", labelKey: "Widget.BorderStyle.Double" },
            { value: "none", label: "No line", labelKey: "Widget.BorderStyle.None" },
          ], cmd: "shapeLineStyle" },
        { type: "select", key: "cap", label: "Cap", labelKey: "Dialog.ShapeAdvanced.Cap",
          value: "flat",
          options: [
            { value: "flat", label: "Flat", labelKey: "Dialog.ShapeAdvanced.CapFlat" },
            { value: "round", label: "Round", labelKey: "Dialog.ShapeAdvanced.CapRound" },
            { value: "square", label: "Square", labelKey: "Dialog.ShapeAdvanced.CapSquare" },
          ] },
        { type: "select", key: "join", label: "Join", labelKey: "Dialog.ShapeAdvanced.Join",
          value: "round",
          options: [
            { value: "round", label: "Round", labelKey: "Dialog.ShapeAdvanced.CapRound" },
            { value: "bevel", label: "Bevel", labelKey: "Dialog.ShapeAdvanced.JoinBevel" },
            { value: "miter", label: "Miter", labelKey: "Dialog.ShapeAdvanced.JoinMiter" },
          ] },
        { type: "select", key: "arrowBegin", label: "Begin arrow", labelKey: "Dialog.ShapeAdvanced.Begin",
          value: "none",
          options: [
            { value: "none", label: "None", labelKey: "Dialog.ShapeAdvanced.ArrowNone" },
            { value: "arrow", label: "Arrow", labelKey: "Dialog.ShapeAdvanced.ArrowArrow" },
            { value: "stealth", label: "Stealth", labelKey: "Dialog.ShapeAdvanced.ArrowStealth" },
            { value: "diamond", label: "Diamond", labelKey: "Dialog.ShapeAdvanced.ArrowDiamond" },
            { value: "oval", label: "Oval", labelKey: "Dialog.ShapeAdvanced.ArrowOval" },
          ], cmd: "shapeArrowBegin" },
        { type: "select", key: "arrowEnd", label: "End arrow", labelKey: "Dialog.ShapeAdvanced.End",
          value: "none",
          options: [
            { value: "none", label: "None", labelKey: "Dialog.ShapeAdvanced.ArrowNone" },
            { value: "arrow", label: "Arrow", labelKey: "Dialog.ShapeAdvanced.ArrowArrow" },
            { value: "stealth", label: "Stealth", labelKey: "Dialog.ShapeAdvanced.ArrowStealth" },
            { value: "diamond", label: "Diamond", labelKey: "Dialog.ShapeAdvanced.ArrowDiamond" },
            { value: "oval", label: "Oval", labelKey: "Dialog.ShapeAdvanced.ArrowOval" },
          ], cmd: "shapeArrowEnd" },
        { type: "button", key: "lineCustom", label: "Custom line color…", labelKey: "Dialog.ShapeAdvanced.CustomLineColor",
          cmd: "openExtendedColor", value: "shape-line" },
      ],
    },
    {
      title: "Shadow",
      titleKey: "Dialog.ShapeAdvanced.Section.Shadow",
      rows: [
        { type: "checkbox", key: "shadowOn", label: "Enable shadow", labelKey: "Dialog.ShapeAdvanced.ShadowOn",
          value: false, cmd: "shapeShadowOn" },
        { type: "color", key: "shadowColor", label: "Shadow color", labelKey: "Dialog.ShapeAdvanced.ShadowColor",
          value: "#000000" },
        { type: "number", key: "shadowBlur", label: "Blur (px)", labelKey: "Dialog.ShapeAdvanced.ShadowBlur",
          min: 0, max: 60, step: 1, value: 6 },
        { type: "number", key: "shadowOffset", label: "Offset (px)", labelKey: "Dialog.ShapeAdvanced.ShadowOffset",
          min: -60, max: 60, step: 1, value: 4 },
        { type: "button", key: "shadowCustom", label: "Custom shadow color…", labelKey: "Dialog.ShapeAdvanced.CustomShadowColor",
          cmd: "openExtendedColor", value: "shape-shadow" },
      ],
    },
    {
      title: "Geometry",
      titleKey: "Dialog.ShapeAdvanced.Section.Geometry",
      rows: [
        { type: "checkbox", key: "moveWithText", label: "Move object with text",
          labelKey: "Dialog.ShapeAdvanced.MoveWithText", value: true },
        { type: "checkbox", key: "lockAspect", label: "Keep aspect ratio",
          labelKey: "Dialog.ShapeAdvanced.LockAspect", value: false },
        { type: "checkbox", key: "behindDoc", label: "Behind text",
          labelKey: "Dialog.ImageAdvanced.WrapBehind", value: false },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// P3-U03: ReviewPopover (common/lib/view/ReviewPopover.js, 1406 lines) — the
// anchored single-thread comment editor (OO opens it on comment click; the
// panel list stays the thread browser). Hosted from the same engine so the
// popover keeps the modal conventions (data-wo-cmd rows, one JSON ledger
// entry per OK, i18n, DIALOG_IDS Tab trap) — editor.js anchors the built
// panel next to the clicked comment span (wo-review-popover class + inline
// left/top) instead of centering it. Rows: edit the comment text, toggle
// resolved, post a reply (OO asc_addReply equivalent over data-replies),
// Go to / Delete as command rows.
// ---------------------------------------------------------------------------
export const REVIEW_POPOVER_SPEC = {
  id: "review-popover-dialog",
  title: "Comment",
  titleKey: "Dialog.ReviewPopover.Title",
  width: 380,
  okCmd: "reviewPopover",
  sections: [
    {
      title: "Thread",
      titleKey: "Dialog.ReviewPopover.Section.Thread",
      rows: [
        { type: "text", key: "author", label: "Author", labelKey: "Dialog.ReviewPopover.Author" },
        { type: "text", key: "text", label: "Comment", labelKey: "Dialog.ReviewPopover.Text" },
        { type: "checkbox", key: "resolved", label: "Resolved", labelKey: "Dialog.ReviewPopover.Resolved",
          value: false },
        { type: "text", key: "reply", label: "Reply…", labelKey: "Dialog.ReviewPopover.Reply",
          placeholder: "Add a reply…" },
        { type: "button", key: "goTo", label: "Go to comment", labelKey: "Dialog.ReviewPopover.GoTo",
          cmd: "reviewPopoverGoTo" },
        { type: "button", key: "delete", label: "Delete", labelKey: "Dialog.ReviewPopover.Delete",
          cmd: "reviewPopoverDelete" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// P3-U03: ExtendedColorDialog (common/lib/view/ExtendedColorDialog.js) — the
// custom-color dialog the palette was missing (ui-webapp.json: "no
// custom-color entry point in palette"). Hosted from the engine with the
// P3-U01 hsbColorPicker widget as the HSB section plus explicit R/G/B, hex
// and opacity rows — the ledger's "HSBColorPicker + ExtendedColorDialog" row
// gets its consumer. editor.js routes the apply to the captured target
// (page background, shape fill/line/shadow) via the openExtendedColor cmd.
// ---------------------------------------------------------------------------
export const EXTENDED_COLOR_DIALOG_SPEC = {
  id: "extended-color-dialog",
  title: "Custom color",
  titleKey: "Dialog.ExtendedColor.Title",
  width: 420,
  okCmd: "extendedColor",
  sections: [
    {
      title: "HSB",
      titleKey: "Dialog.ExtendedColor.Section.HSB",
      rows: [
        { type: "custom", key: "hsb", label: "Picker", labelKey: "Dialog.ExtendedColor.Picker",
          widget: "hsbColorPicker" },
      ],
    },
    {
      title: "RGB & hex",
      titleKey: "Dialog.ExtendedColor.Section.RGB",
      rows: [
        { type: "number", key: "r", label: "Red (0–255)", labelKey: "Dialog.ExtendedColor.Red",
          min: 0, max: 255, step: 1, value: 255 },
        { type: "number", key: "g", label: "Green (0–255)", labelKey: "Dialog.ExtendedColor.Green",
          min: 0, max: 255, step: 1, value: 255 },
        { type: "number", key: "b", label: "Blue (0–255)", labelKey: "Dialog.ExtendedColor.Blue",
          min: 0, max: 255, step: 1, value: 255 },
        { type: "text", key: "hex", label: "Hex value", labelKey: "Widget.HSB.Hex", value: "#ffffff" },
        { type: "range", key: "alpha", label: "Opacity (%)", labelKey: "Dialog.ExtendedColor.Alpha",
          min: 0, max: 100, step: 1, value: 100 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// P3-U04: Long-tail dialog batch from the engine
//   rename / copy-warning / text-input / footnote-tip / sync-tip / style-title
//   / shortcuts-edit / select-file / quick-access / charts3d / text-art
//   / format-settings / mail-merge-email / document-access
// ---------------------------------------------------------------------------

export const RENAME_DIALOG_SPEC = {
  id: "rename-dialog",
  title: "Rename",
  titleKey: "Dialog.Rename.Title",
  width: 400,
  okCmd: "renameDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "name", label: "New name", labelKey: "Dialog.Rename.NewName",
          value: "", cmd: "renameSetName" },
      ],
    },
  ],
};

export const COPY_WARNING_DIALOG_SPEC = {
  id: "copy-warning-dialog",
  title: "Copy Warning",
  titleKey: "Dialog.CopyWarning.Title",
  width: 400,
  okCmd: "copyWarningDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "message", label: "Warning", labelKey: "Dialog.CopyWarning.Message",
          value: "Copying may affect formatting", cmd: "copyWarningAck" },
        { type: "checkbox", key: "dontShowAgain", label: "Don't show again",
          labelKey: "Dialog.CopyWarning.DontShowAgain", value: false },
      ],
    },
  ],
};

export const TEXT_INPUT_DIALOG_SPEC = {
  id: "text-input-dialog",
  title: "Text Input",
  titleKey: "Dialog.TextInput.Title",
  width: 400,
  okCmd: "textInputDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "input", label: "Enter text", labelKey: "Dialog.TextInput.Label",
          value: "", cmd: "textInputSet" },
      ],
    },
  ],
};

export const FOOTNOTE_TIP_DIALOG_SPEC = {
  id: "footnote-tip-dialog",
  title: "Footnote",
  titleKey: "Dialog.FootnoteTip.Title",
  width: 400,
  okCmd: "footnoteTipDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "footnote", label: "Footnote text", labelKey: "Dialog.FootnoteTip.Text",
          value: "", cmd: "footnoteTipSet" },
        { type: "number", key: "position", label: "Position", labelKey: "Dialog.FootnoteTip.Position",
          min: 1, max: 100, step: 1, value: 1, cmd: "footnoteTipPosition" },
      ],
    },
  ],
};

export const SYNC_TIP_DIALOG_SPEC = {
  id: "sync-tip-dialog",
  title: "Synchronization",
  titleKey: "Dialog.SyncTip.Title",
  width: 400,
  okCmd: "syncTipDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "status", label: "Sync status", labelKey: "Dialog.SyncTip.Status",
          value: "Synchronized", cmd: "syncTipStatus" },
        { type: "checkbox", key: "autoSync", label: "Auto-sync",
          labelKey: "Dialog.SyncTip.AutoSync", value: true, cmd: "syncTipAuto" },
      ],
    },
  ],
};

export const STYLE_TITLE_DIALOG_SPEC = {
  id: "style-title-dialog",
  title: "Style Title",
  titleKey: "Dialog.StyleTitle.Title",
  width: 400,
  okCmd: "styleTitleDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "title", label: "Title", labelKey: "Dialog.StyleTitle.Label",
          value: "", cmd: "styleTitleSet" },
        { type: "color", key: "titleColor", label: "Title color", labelKey: "Dialog.StyleTitle.Color",
          value: "#000000", cmd: "styleTitleColor" },
      ],
    },
  ],
};

export const SHORTCUTS_EDIT_DIALOG_SPEC = {
  id: "shortcuts-edit-dialog",
  title: "Edit Shortcuts",
  titleKey: "Dialog.ShortcutsEdit.Title",
  width: 500,
  okCmd: "shortcutsEditDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "command", label: "Command", labelKey: "Dialog.ShortcutsEdit.Command",
          value: "", cmd: "shortcutsEditCommand" },
        { type: "text", key: "shortcut", label: "Shortcut", labelKey: "Dialog.ShortcutsEdit.Shortcut",
          value: "", cmd: "shortcutsEditShortcut" },
        { type: "button", key: "reset", label: "Reset to defaults", labelKey: "Dialog.ShortcutsEdit.Reset",
          cmd: "shortcutsEditReset" },
      ],
    },
  ],
};

export const SELECT_FILE_DIALOG_SPEC = {
  id: "select-file-dialog",
  title: "Select File",
  titleKey: "Dialog.SelectFile.Title",
  width: 500,
  okCmd: "selectFileDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "filePath", label: "File path", labelKey: "Dialog.SelectFile.Path",
          value: "", cmd: "selectFilePath" },
        { type: "button", key: "browse", label: "Browse...", labelKey: "Dialog.SelectFile.Browse",
          cmd: "selectFileBrowse" },
        { type: "checkbox", key: "remember", label: "Remember selection",
          labelKey: "Dialog.SelectFile.Remember", value: false },
      ],
    },
  ],
};

export const QUICK_ACCESS_DIALOG_SPEC = {
  id: "quick-access-dialog",
  title: "Quick Access",
  titleKey: "Dialog.QuickAccess.Title",
  width: 400,
  okCmd: "quickAccessDialog",
  sections: [
    {
      rows: [
        { type: "select", key: "item", label: "Add to Quick Access", labelKey: "Dialog.QuickAccess.Item",
          value: "",
          options: [
            { value: "save", label: "Save", labelKey: "Dialog.QuickAccess.Save" },
            { value: "undo", label: "Undo", labelKey: "Dialog.QuickAccess.Undo" },
            { value: "redo", label: "Redo", labelKey: "Dialog.QuickAccess.Redo" },
          ], cmd: "quickAccessAdd" },
      ],
    },
  ],
};

export const CHARTS3D_DIALOG_SPEC = {
  id: "charts3d-dialog",
  title: "3D Chart Settings",
  titleKey: "Dialog.Charts3d.Title",
  width: 500,
  okCmd: "charts3dDialog",
  sections: [
    {
      title: "3D View",
      titleKey: "Dialog.Charts3d.Section.View",
      rows: [
        { type: "checkbox", key: "enable3d", label: "Enable 3D", labelKey: "Dialog.Charts3d.Enable3d",
          value: true, cmd: "charts3dEnable" },
        { type: "number", key: "rotation", label: "Rotation (degrees)", labelKey: "Dialog.Charts3d.Rotation",
          min: 0, max: 360, step: 1, value: 30, cmd: "charts3dRotation" },
        { type: "number", key: "elevation", label: "Elevation (degrees)", labelKey: "Dialog.Charts3d.Elevation",
          min: 0, max: 90, step: 1, value: 15, cmd: "charts3dElevation" },
        { type: "number", key: "depth", label: "Depth (%)", labelKey: "Dialog.Charts3d.Depth",
          min: 0, max: 300, step: 10, value: 100, cmd: "charts3dDepth" },
      ],
    },
    {
      title: "Lighting",
      titleKey: "Dialog.Charts3d.Section.Lighting",
      rows: [
        { type: "select", key: "lighting", label: "Lighting preset", labelKey: "Dialog.Charts3d.Lighting",
          value: "bright",
          options: [
            { value: "bright", label: "Bright", labelKey: "Dialog.Charts3d.Bright" },
            { value: "moderate", label: "Moderate", labelKey: "Dialog.Charts3d.Moderate" },
            { value: "dim", label: "Dim", labelKey: "Dialog.Charts3d.Dim" },
          ], cmd: "charts3dLighting" },
      ],
    },
  ],
};

export const TEXT_ART_DIALOG_SPEC = {
  id: "text-art-dialog",
  title: "Text Art",
  titleKey: "Dialog.TextArt.Title",
  width: 500,
  okCmd: "textArtDialog",
  sections: [
    {
      rows: [
        { type: "text", key: "text", label: "Text", labelKey: "Dialog.TextArt.Text",
          value: "Sample Text", cmd: "textArtSetText" },
        { type: "select", key: "style", label: "Style", labelKey: "Dialog.TextArt.Style",
          value: "normal",
          options: [
            { value: "normal", label: "Normal", labelKey: "Dialog.TextArt.Normal" },
            { value: "bold", label: "Bold", labelKey: "Dialog.TextArt.Bold" },
            { value: "italic", label: "Italic", labelKey: "Dialog.TextArt.Italic" },
          ], cmd: "textArtStyle" },
        { type: "color", key: "color", label: "Color", labelKey: "Dialog.TextArt.Color",
          value: "#000000", cmd: "textArtColor" },
        { type: "number", key: "size", label: "Size (pt)", labelKey: "Dialog.TextArt.Size",
          min: 6, max: 72, step: 1, value: 12, cmd: "textArtSize" },
      ],
    },
  ],
};

export const FORMAT_SETTINGS_DIALOG_SPEC = {
  id: "format-settings-dialog",
  title: "Format Settings",
  titleKey: "Dialog.FormatSettings.Title",
  width: 500,
  okCmd: "formatSettingsDialog",
  sections: [
    {
      title: "Text Format",
      titleKey: "Dialog.FormatSettings.Section.Text",
      rows: [
        { type: "select", key: "font", label: "Font", labelKey: "Dialog.FormatSettings.Font",
          value: "Arial",
          options: [
            { value: "Arial", label: "Arial" },
            { value: " Times New Roman", label: " Times New Roman" },
            { value: "Courier New", label: "Courier New" },
          ], cmd: "formatSettingsFont" },
        { type: "number", key: "size", label: "Size (pt)", labelKey: "Dialog.FormatSettings.Size",
          min: 6, max: 72, step: 1, value: 12, cmd: "formatSettingsSize" },
        { type: "color", key: "color", label: "Color", labelKey: "Dialog.FormatSettings.Color",
          value: "#000000", cmd: "formatSettingsColor" },
      ],
    },
    {
      title: "Paragraph",
      titleKey: "Dialog.FormatSettings.Section.Paragraph",
      rows: [
        { type: "select", key: "alignment", label: "Alignment", labelKey: "Dialog.FormatSettings.Alignment",
          value: "left",
          options: [
            { value: "left", label: "Left", labelKey: "Dialog.FormatSettings.Left" },
            { value: "center", label: "Center", labelKey: "Dialog.FormatSettings.Center" },
            { value: "right", label: "Right", labelKey: "Dialog.FormatSettings.Right" },
          ], cmd: "formatSettingsAlignment" },
        { type: "number", key: "lineSpacing", label: "Line spacing", labelKey: "Dialog.FormatSettings.LineSpacing",
          min: 1, max: 3, step: 0.1, value: 1.5, cmd: "formatSettingsLineSpacing" },
      ],
    },
  ],
};

export const MAIL_MERGE_EMAIL_DIALOG_SPEC = {
  id: "mail-merge-email-dialog",
  title: "Mail Merge Email",
  titleKey: "Dialog.MailMergeEmail.Title",
  width: 500,
  okCmd: "mailMergeEmailDialog",
  sections: [
    {
      title: "Email Settings",
      titleKey: "Dialog.MailMergeEmail.Section.Settings",
      rows: [
        { type: "text", key: "subject", label: "Subject", labelKey: "Dialog.MailMergeEmail.Subject",
          value: "", cmd: "mailMergeEmailSubject" },
        { type: "text", key: "from", label: "From", labelKey: "Dialog.MailMergeEmail.From",
          value: "", cmd: "mailMergeEmailFrom" },
        { type: "select", key: "format", label: "Format", labelKey: "Dialog.MailMergeEmail.Format",
          value: "html",
          options: [
            { value: "html", label: "HTML", labelKey: "Dialog.MailMergeEmail.HTML" },
            { value: "plain", label: "Plain Text", labelKey: "Dialog.MailMergeEmail.Plain" },
          ], cmd: "mailMergeEmailFormat" },
      ],
    },
    {
      title: "Recipients",
      titleKey: "Dialog.MailMergeEmail.Section.Recipients",
      rows: [
        { type: "text", key: "to", label: "To", labelKey: "Dialog.MailMergeEmail.To",
          value: "", cmd: "mailMergeEmailTo" },
        { type: "text", key: "cc", label: "CC", labelKey: "Dialog.MailMergeEmail.CC",
          value: "", cmd: "mailMergeEmailCC" },
        { type: "text", key: "bcc", label: "BCC", labelKey: "Dialog.MailMergeEmail.BCC",
          value: "", cmd: "mailMergeEmailBCC" },
      ],
    },
  ],
};

export const DOCUMENT_ACCESS_DIALOG_SPEC = {
  id: "document-access-dialog",
  title: "Document Access",
  titleKey: "Dialog.DocumentAccess.Title",
  width: 500,
  okCmd: "documentAccessDialog",
  sections: [
    {
      title: "Permissions",
      titleKey: "Dialog.DocumentAccess.Section.Permissions",
      rows: [
        { type: "select", key: "access", label: "Access level", labelKey: "Dialog.DocumentAccess.Access",
          value: "read",
          options: [
            { value: "read", label: "Read Only", labelKey: "Dialog.DocumentAccess.Read" },
            { value: "comment", label: "Can Comment", labelKey: "Dialog.DocumentAccess.Comment" },
            { value: "edit", label: "Can Edit", labelKey: "Dialog.DocumentAccess.Edit" },
          ], cmd: "documentAccessLevel" },
        { type: "text", key: "users", label: "Users", labelKey: "Dialog.DocumentAccess.Users",
          value: "", cmd: "documentAccessUsers" },
        { type: "checkbox", key: "allowDownload", label: "Allow download",
          labelKey: "Dialog.DocumentAccess.Download", value: false, cmd: "documentAccessDownload" },
      ],
    },
    {
      title: "Expiration",
      titleKey: "Dialog.DocumentAccess.Section.Expiration",
      rows: [
        { type: "checkbox", key: "expires", label: "Link expires",
          labelKey: "Dialog.DocumentAccess.Expires", value: false, cmd: "documentAccessExpires" },
        { type: "number", key: "days", label: "Days until expiration", labelKey: "Dialog.DocumentAccess.Days",
          min: 1, max: 365, step: 1, value: 7, cmd: "documentAccessDays" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// FX-U2: form-roles + form-settings dialog specs — RolesManagerDlg (role
// list over the wo-bridge wasm role ops), RoleEditDlg (name/color/user),
// RoleDeleteDlg (confirm blurb) and FormSettings (per-field role +
// required + filling mode). Specs only; the behavioral half (open/apply,
// wasm-first woRolesGetAll/Add/Edit/Remove call path) lives in editor.js.
// ---------------------------------------------------------------------------
export const ROLES_MANAGER_SPEC = {
  id: "roles-manager-dialog",
  title: "Form roles",
  titleKey: "Dialog.Roles.Title",
  width: 520,
  okCmd: "rolesManagerOk",
  sections: [
    {
      title: "Roles",
      titleKey: "Dialog.Roles.Section",
      rows: [
        { type: "custom", key: "roles", label: "Roles", labelKey: "Dialog.Roles.Section",
          widget: "roleList" },
        { type: "button", key: "rolesAdd", label: "Add…", labelKey: "Widget.RolesList.Add",
          cmd: "rolesAddClick" },
        { type: "button", key: "rolesEdit", label: "Edit…", labelKey: "Widget.RolesList.Edit",
          cmd: "rolesEditClick" },
        { type: "button", key: "rolesRemove", label: "Remove…", labelKey: "Widget.RolesList.Remove",
          cmd: "rolesRemoveClick" },
      ],
    },
  ],
};

export const ROLE_EDIT_SPEC = {
  id: "role-edit-dialog",
  title: "Role",
  titleKey: "Dialog.RoleEdit.Title",
  width: 440,
  okCmd: "roleEditOk",
  sections: [
    {
      title: "Role",
      titleKey: "Dialog.RoleEdit.Title",
      rows: [
        { type: "text", key: "name", label: "Name", labelKey: "Dialog.RoleEdit.Name", value: "" },
        { type: "color", key: "color", label: "Color", labelKey: "Dialog.RoleEdit.Color", value: "#6C8EBF" },
        { type: "text", key: "user", label: "Assigned user", labelKey: "Dialog.RoleEdit.User", value: "" },
      ],
    },
  ],
};

export const ROLE_DELETE_SPEC = {
  id: "role-delete-dialog",
  title: "Delete role",
  titleKey: "Dialog.RoleDelete.Title",
  width: 440,
  okCmd: "roleDeleteOk",
  sections: [
    {
      title: "Role",
      titleKey: "Dialog.RoleDelete.Title",
      rows: [
        { type: "custom", key: "roleInfo", label: "Role", labelKey: "Dialog.RoleDelete.Title",
          widget: "roleDeleteInfo" },
      ],
    },
  ],
};

export const FORM_SETTINGS_SPEC = {
  id: "form-settings-dialog",
  title: "Form settings",
  titleKey: "Dialog.FormSettings.Title",
  width: 680,
  okCmd: "formSettingsOk",
  sections: [
    {
      title: "Form fields",
      titleKey: "Dialog.FormSettings.Section",
      rows: [
        { type: "custom", key: "fields", label: "Form fields", labelKey: "Dialog.FormSettings.Section",
          widget: "formFields" },
      ],
    },
  ],
};

/**
 * Named spec registry for editor.js / tests (window.WoDialogs.WO_DIALOG_SPECS). */
export const WO_DIALOG_SPECS = {
  tableSettingsAdvanced: TABLE_SETTINGS_ADVANCED_SPEC,
  imageSettingsAdvanced: IMAGE_SETTINGS_ADVANCED_SPEC,
  shapeSettings: SHAPE_SETTINGS_SPEC,
  reviewPopover: REVIEW_POPOVER_SPEC,
  extendedColorDialog: EXTENDED_COLOR_DIALOG_SPEC,
  renameDialog: RENAME_DIALOG_SPEC,
  copyWarningDialog: COPY_WARNING_DIALOG_SPEC,
  textInputDialog: TEXT_INPUT_DIALOG_SPEC,
  footnoteTipDialog: FOOTNOTE_TIP_DIALOG_SPEC,
  syncTipDialog: SYNC_TIP_DIALOG_SPEC,
  styleTitleDialog: STYLE_TITLE_DIALOG_SPEC,
  shortcutsEditDialog: SHORTCUTS_EDIT_DIALOG_SPEC,
  selectFileDialog: SELECT_FILE_DIALOG_SPEC,
  quickAccessDialog: QUICK_ACCESS_DIALOG_SPEC,
  charts3dDialog: CHARTS3D_DIALOG_SPEC,
  textArtDialog: TEXT_ART_DIALOG_SPEC,
  formatSettingsDialog: FORMAT_SETTINGS_DIALOG_SPEC,
  mailMergeEmailDialog: MAIL_MERGE_EMAIL_DIALOG_SPEC,
  documentAccessDialog: DOCUMENT_ACCESS_DIALOG_SPEC,
  rolesManager: ROLES_MANAGER_SPEC,
  roleEdit: ROLE_EDIT_SPEC,
  roleDelete: ROLE_DELETE_SPEC,
  formSettings: FORM_SETTINGS_SPEC,
};

/** Convenience: buildDialog(engine, spec) — or buildDialog(spec) against a
 *  shared module-level engine so callers without an engine still work. */
let _defaultEngine = null;
export function buildDialog(engineOrSpec, maybeSpec) {
  if (engineOrSpec instanceof WoDialogEngine) return engineOrSpec.build(maybeSpec);
  if (!_defaultEngine) _defaultEngine = new WoDialogEngine();
  return _defaultEngine.build(engineOrSpec);
}

// ---------------------------------------------------------------------------
// Boot: expose the engine + widget factories for editor.js / future dialog
// specs. No DOM is touched here — the module stays import-safe headless.
// ---------------------------------------------------------------------------
const WoDialogs = {
  WoDialogEngine,
  buildDialog,
  tableStyler,
  hsbColorPicker,
  multiSliderGradient,
  WO_CUSTOM_WIDGETS,
  WO_DIALOG_SPECS,
  hsbToHex,
  hexToHsb,
  seedEngineStrings,
};
if (typeof window !== "undefined") {
  window.WoDialogs = WoDialogs;
  window.woDialogEngine = new WoDialogEngine();
}
export { WoDialogs };
