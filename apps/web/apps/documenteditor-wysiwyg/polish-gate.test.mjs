/**
 * polish-gate.test.mjs — static pins for the CHROME5-POLISH-ACCENTS polish
 * pass (OO parity: live statusbar zoom slider, contextual tab accents,
 * ribbon hover/active/focus/disabled microstates, tab strip typography).
 *
 * Run: node polish-gate.test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const css = readFileSync(resolve(HERE, "style.css"), "utf8");
const editorJs = readFileSync(resolve(HERE, "editor.js"), "utf8");

// --- statusbar zoom slider: live control, two-way synced ---------------------
const sliderMatch = html.match(/<input[^>]*id="sb-zoom-slider"[^>]*>/);
assert.ok(sliderMatch, "statusbar slider input#sb-zoom-slider must exist");
const sliderTag = sliderMatch[0];
assert.ok(/min="50"/.test(sliderTag) && /max="200"/.test(sliderTag) && /step="10"/.test(sliderTag),
  "slider range must match applyZoom bounds (50%..200%, 10% steps)");
assert.ok(/data-i18n-aria-label="Statusbar.ZoomSlider"/.test(sliderTag),
  "slider aria-label must be i18n-wired (Statusbar.ZoomSlider)");
assert.ok(!html.includes('id="zoom-slider"'),
  "old zoom-slider id must be fully renamed to sb-zoom-slider");
assert.ok((editorJs.match(/getElementById\("sb-zoom-slider"\)/g) || []).length === 2,
  "editor.js must reference sb-zoom-slider exactly twice (applyZoom + wiring)");

// --- i18n: Statusbar.ZoomSlider in en AND de ---------------------------------
const i18nSrc = readFileSync(resolve(HERE, "i18n.js"), "utf8");
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(i18nSrc, sandbox, { filename: "i18n.js" });
const { DEFAULT_TRANSLATIONS: en, LOCALE_CATALOGS: { de } } = sandbox.module.exports;
for (const key of ["Statusbar.ZoomSlider"]) {
  assert.ok(Object.hasOwn(en, key), `${key} must exist in the en catalog`);
  assert.ok(Object.hasOwn(de, key), `${key} must exist in the de catalog`);
}

// --- contextual tab accent: chart-design / draw / header-footer ---------------
for (const tab of ["draw", "chart-design", "header-footer"]) {
  const tag = html.match(new RegExp(`<button[^>]*data-tab="${tab}"[^>]*>`));
  assert.ok(tag, `${tab} tab button must exist`);
  assert.ok(/class="ribbon-tab contextual"/.test(tag[0]),
    `${tab} tab must carry the contextual accent class`);
}
const ctxRule = css.match(/\.titlebar button\.ribbon-tab\.contextual\s*\{[^}]*\}/);
assert.ok(ctxRule, ".titlebar button.ribbon-tab.contextual accent rule must exist");
assert.ok(/border-bottom:\s*2px solid var\(--accent\)/.test(ctxRule[0]),
  "contextual accent must be the 2px accent underline");
assert.ok(/\.titlebar button\.ribbon-tab\.contextual:not\(\[aria-selected="true"\]\)/.test(css),
  "inactive contextual tabs get the tinted face");

// --- microstates: shared transition / press / focus / disabled rhythm --------
assert.ok(/transition:\s*background-color 120ms ease, border-color 120ms ease, color 120ms ease/.test(css),
  "chrome buttons share the 120ms bg/border/color transition");
assert.ok(/\.toolbar button:active,\s*\n\.titlebar button:active,\s*\n\.statusbar button:active\s*\{[^}]*transform:\s*translateY\(1px\)/.test(css),
  "pressed chrome buttons offset translateY(1px)");
assert.ok(/\.titlebar button:focus-visible,/.test(css) && /\.statusbar button:focus-visible,/.test(css),
  "focus-visible ring must cover titlebar + statusbar buttons");
assert.ok(/\.toolbar button\[aria-disabled="true"\],[\s\S]*?opacity:\s*0\.45/.test(css),
  "disabled chrome buttons gray out (opacity 0.45)");

// --- tab strip typography + tinted File tab ----------------------------------
const tabRule = css.match(/\.titlebar button\.ribbon-tab\s*\{[^}]*\}/);
assert.ok(tabRule, ".titlebar button.ribbon-tab typography rule must exist");
assert.ok(/height:\s*28px/.test(tabRule[0]) && /font-size:\s*12\.5px/.test(tabRule[0])
  && /padding:\s*0 12px/.test(tabRule[0]) && /font-weight:\s*400/.test(tabRule[0]),
  "tab strip: 28px band, 12.5px label, 12px side padding, regular weight");
const pillRule = css.match(/\.ribbon-tab\[aria-selected="true"\]\s*\{[^}]*\}/);
assert.ok(pillRule && /font-weight:\s*500/.test(pillRule[0]),
  "active tab label weight is medium (500)");
assert.ok(/--ctx-tab-tint:/.test(css.match(/:root\s*\{[^}]*\}/)[0])
  && /--ctx-tab-tint:/.test(css.match(/html\.light\s*\{[^}]*\}/)[0]),
  "--ctx-tab-tint defined in BOTH themes");
assert.ok(/--tab-file-tint:/.test(css.match(/:root\s*\{[^}]*\}/)[0])
  && /--tab-file-tint:/.test(css.match(/html\.light\s*\{[^}]*\}/)[0]),
  "--tab-file-tint defined in BOTH themes");
assert.ok(/\.ribbon-tabs \.menu-trigger\.file-tab\s*\{[^}]*background:\s*var\(--tab-file-tint\)/.test(css),
  "File tab carries the tinted face");

// --- statusbar zoom squares + slider track -----------------------------------
assert.ok(/\.statusbar button\.sb-zoom-square\s*\{[^}]*height:\s*28px/.test(css),
  "statusbar zoom squares are 28px");
assert.ok(html.includes('class="sb sb-zoom-square" id="btn-zoom-out"')
  && html.includes('class="sb sb-zoom-square" id="btn-zoom-fit"'),
  "zoom-out/fit carry the 28px square class");
const sliderCss = css.match(/\.zoom-slider\s*\{[^}]*\}/);
assert.ok(sliderCss && /width:\s*100px/.test(sliderCss[0]) && /accent-color:\s*var\(--accent\)/.test(sliderCss[0]),
  "zoom slider: ~100px track, theme accent fill");

console.log("polish-gate: slider pins, i18n en+de, contextual accent, microstates, tab typography OK");
