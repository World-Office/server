/**
 * ribbon-tab-keyboard.test.mjs — static pins for ribbon tab keyboard
 * navigation (RIB-002, WAI-ARIA tabs pattern with automatic activation):
 * roving tabindex on .ribbon-tab, arrow/Home/End handling on the tablist.
 *
 * Run: node ribbon-tab-keyboard.test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const js = readFileSync(resolve(HERE, "editor.js"), "utf8");

// The strip is a real tablist and its tabs carry role=tab (input contract).
assert.ok(html.includes('class="ribbon-tabs" role="tablist"'), "tab strip must be role=tablist");
assert.ok(html.includes('class="ribbon-tab" data-tab="home" role="tab"'), "tabs must carry role=tab");

// Roving tabindex: only the selected tab is tabbable, refreshed on selection.
assert.ok(js.includes("function syncRibbonTabindex()"), "roving tabindex helper must exist");
assert.ok(/querySelectorAll\("\.ribbon-tab"\)\.forEach\(\(t\) =>\s*\n\s*t\.setAttribute\("tabindex"/.test(js),
  "every .ribbon-tab gets an explicit tabindex");
const clickBlock = js.slice(js.indexOf("// --- ribbon tabs: switch"), js.indexOf("// --- ribbon overflow chevrons"));
assert.ok(clickBlock.includes("syncRibbonTabindex();"), "click wiring must refresh the roving tabindex");

// Arrow keys on the tablist move focus and activate; Home/End jump.
const kbStart = js.indexOf("ribbon tab keyboard navigation");
assert.ok(kbStart !== -1, "keyboard navigation wiring must exist");
const kbBlock = js.slice(kbStart, js.indexOf("// --- ribbon overflow chevrons"));
for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
  assert.ok(kbBlock.includes(`ev.key === "${key}"`), `tablist keydown must handle ${key}`);
}
assert.ok(kbBlock.includes('.ribbon-tab"'),
  "navigation operates on .ribbon-tab elements");
assert.ok(kbBlock.includes("!t.hidden"), "hidden contextual tabs must be skipped");
assert.ok(kbBlock.includes("ev.preventDefault()"), "arrow keys must not scroll the page");
assert.ok(kbBlock.includes(".focus();") && kbBlock.includes(".click();"),
  "arrows move focus AND activate (automatic activation)");

console.log("OK: ribbon tab keyboard navigation pins hold");
