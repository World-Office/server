/**
 * chrome-gate.test.mjs — static pins for the CHROME1-TITLE-TAB-ROW chrome
 * restructure (OO parity: ONE title row with the tab strip next to the
 * wordmark, light-gray function band, single-line group flow with chevron
 * overflow buttons).
 *
 * Run: node chrome-gate.test.mjs
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

// --- row 1: titlebar carries the tab strip, File trigger and QA cluster -----
const tbStart = html.indexOf('<div class="titlebar">');
const toolbarStart = html.indexOf('<header id="toolbar"');
assert.ok(tbStart !== -1 && toolbarStart !== -1, "titlebar + toolbar must exist");
const tbBlock = html.slice(tbStart, toolbarStart);
assert.ok(tbBlock.includes('class="ribbon-tabs"'), ".ribbon-tabs must live inside .titlebar");
assert.ok(tbBlock.includes('id="btn-file"'), "#btn-file (File trigger) must live inside .titlebar");
assert.ok(tbBlock.indexOf('id="btn-file"') < tbBlock.indexOf('class="ribbon-tab" data-tab="home"'),
  "File trigger must be the FIRST entry of the tab strip");
assert.ok(tbBlock.includes('id="btn-print-qa"'), "#btn-print-qa moved into .titlebar");
assert.ok(tbBlock.includes('id="user-chip"'), "#user-chip moved into .titlebar");
assert.ok(tbBlock.includes('id="btn-redo-qa"'), "#btn-redo-qa moved into .titlebar");
assert.ok(tbBlock.includes('id="btn-save"'), "#btn-save stays in .titlebar");
assert.ok(tbBlock.includes('id="btn-undo-tb"'), "#btn-undo-tb stays in .titlebar");

// --- nav#menu-bar is gone ----------------------------------------------------
assert.ok(!html.includes('id="menu-bar"'), "nav#menu-bar must be deleted");
assert.ok(!html.includes('class="menu-bar"'), ".menu-bar markup must be gone");

// --- chevron buttons exist in the band markup --------------------------------
assert.ok((html.match(/class="rib-scroll-btn"/g) || []).length === 2,
  "exactly two .rib-scroll-btn chevron buttons in the markup");
assert.ok(html.includes('id="rib-scroll-left"') && html.includes('id="rib-scroll-right"'),
  "chevron button ids present");
assert.ok(html.includes('data-i18n-aria-label="Toolbar.ScrollLeft"') &&
  html.includes('data-i18n-aria-label="Toolbar.ScrollRight"'),
  "chevrons carry the i18n aria-label keys");

// --- i18n: ScrollLeft/Right exist in en AND de catalogs ----------------------
const i18nSrc = readFileSync(resolve(HERE, "i18n.js"), "utf8");
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(i18nSrc, sandbox, { filename: "i18n.js" });
const { DEFAULT_TRANSLATIONS: en, LOCALE_CATALOGS: { de } } = sandbox.module.exports;
for (const key of ["Toolbar.ScrollLeft", "Toolbar.ScrollRight"]) {
  assert.ok(Object.hasOwn(en, key), `${key} must exist in the en catalog`);
  assert.ok(Object.hasOwn(de, key), `${key} must exist in the de catalog`);
}

// --- band: nowrap single-line flow, OO gray, separators kept -----------------
const pageActiveBlocks = [...css.matchAll(/\.ribbon-page\.active\s*\{[^}]*\}/g)].map(m => m[0]);
assert.ok(pageActiveBlocks.length >= 2, ".ribbon-page.active rules present");
for (const block of pageActiveBlocks) {
  assert.ok(!/flex-wrap:\s*wrap/.test(block),
    ".ribbon-page.active must NOT wrap (single left-to-right flow)");
}
assert.ok(pageActiveBlocks.some(b => /flex-wrap:\s*nowrap/.test(b)),
  ".ribbon-page.active must pin flex-wrap: nowrap");
assert.ok(/\.ribbon-row\s*\{[^}]*flex-wrap:\s*nowrap/.test(css), ".ribbon-row stays nowrap");
assert.ok(!/\.ribbon-row\s*\{[^}]*overflow-x:\s*clip/.test(css),
  ".ribbon-row must not clip (transform scroll relies on the band clip)");
assert.ok(/min-height:\s*84px/.test(css), "function band single-row min-height 84px");
assert.ok(/--ribbon:\s*#f7f7f7/.test(css), "light theme --ribbon is OO classic-light gray");
assert.ok(css.includes(".toolbar .rb-sep {") || css.includes(".toolbar .rb-sep{"),
  ".rb-sep separators still styled");
assert.ok(css.includes(".toolbar button.rib-scroll-btn"), "chevron styles present");
assert.ok(/\.toolbar\.ribbon-collapsed\s*\{[^}]*display:\s*none/.test(css),
  "collapsed ribbon hides the band (tabs stay in row 1)");
assert.ok(/--tab-active-bg:\s*#ffffff/.test(css), "active tab pill is white in light theme");

// --- editor.js: chevron scroll machinery wired -------------------------------
for (const needle of [
  "function updateRibbonScroll",
  'getElementById("rib-scroll-left")',
  'getElementById("rib-scroll-right")',
  "translateX",
  "updateRibbonScroll(true)",
  'addEventListener("wheel"',
  'addEventListener("resize"',
  "ribbon-collapsed",
]) {
  assert.ok(editorJs.includes(needle), `editor.js must reference ${needle}`);
}

console.log("chrome-gate: title/tab row, chevrons, i18n en+de, nowrap band OK");
