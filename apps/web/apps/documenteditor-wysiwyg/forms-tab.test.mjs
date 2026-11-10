/**
 * FX-U1 gate: Forms tab — field palette (text/checkbox/dropdown/date) +
 * view-fill-mode toggle. Node built-in assert, zero dependencies,
 * static source contract (AF3-STATUSBAR house style). Final line
 * FORMS-PASS iff every check holds.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf-8");
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf-8");

console.log("Running FX-U1 forms-tab tests...\n");

// 1. ribbon tab + page
assert.ok(html.includes('data-tab="forms"'), "Forms ribbon tab button missing");
assert.ok(html.includes('data-i18n="Tab.Forms"'), "Tab.Forms i18n marker missing");
assert.ok(/class="ribbon-page"[^>]*data-tab="forms"/.test(html), "forms ribbon-page missing");

// 2. field palette: 4 buttons with ids + data-cmd + i18n
for (const [id, cmd] of [
  ["btn-text-field", "insertTextField"],
  ["btn-checkbox-field", "insertCheckboxField"],
  ["btn-dropdown-field", "insertDropdownField"],
  ["btn-date-field", "insertDateField"],
]) {
  const btn = new RegExp(`id="${id}"[^>]*data-cmd="${cmd}"`).test(html);
  assert.ok(btn, `${id} button with data-cmd=${cmd} missing`);
}

// 3. view/fill mode toggle: aria-pressed state + dedicated cmd
assert.ok(html.includes('id="btn-forms-view-fill"'), "btn-forms-view-fill missing");
assert.ok(html.includes('data-cmd="toggleFormDesignMode"'), "toggleFormDesignMode cmd missing");
assert.ok(html.includes('aria-pressed="false"'), "aria-pressed initial state missing");

// 4. editor wiring: cmd dispatch + the insert/toggle functions
for (const cmd of ["insertTextField", "insertCheckboxField", "insertDropdownField", "insertDateField", "toggleFormDesignMode"]) {
  assert.ok(js.includes(`cmd === "${cmd}"`), `cmd dispatch for ${cmd} missing`);
}
assert.ok(/function insertFormField\(/.test(js), "insertFormField function missing");
assert.ok(/function toggleFormDesignMode\(/.test(js), "toggleFormDesignMode function missing");

// 5. field semantics: span.form-field[data-form-field] contenteditable=false,
//    typed inner controls (checkbox / select / date / text)
assert.ok(js.includes('"form-field form-field-"'), "form-field class builder missing");
assert.ok(js.includes('setAttribute("contenteditable", "false")'), "field must be contenteditable=false");
assert.ok(js.includes('setAttribute("data-form-field"'), "data-form-field attribute missing");
assert.ok(js.includes('type="checkbox"'), "checkbox inner control missing");
assert.ok(js.includes("<select"), "dropdown inner control missing");
assert.ok(js.includes('type="date"'), "date inner control missing");
assert.ok(js.includes('type="text" placeholder="Enter text"'), "text inner control missing");

// 6. design/fill mode toggles pointer-events on every .form-field input
assert.ok(js.includes('classList.toggle("forms-design-mode"'), "body class toggle missing");
assert.ok(js.includes('querySelectorAll(".form-field")'), "field-wide pointer-events sweep missing");

// 7. i18n: Tab.Forms + all Forms.* keys in BOTH catalogs (EN + DE)
const keys = ["Tab.Forms", "Forms.TextField", "Forms.Checkbox", "Forms.Dropdown", "Forms.Date",
  "Forms.ViewFillMode", "Forms.TextFieldTitle", "Forms.CheckboxTitle", "Forms.DropdownTitle",
  "Forms.DateTitle", "Forms.ViewFillModeTitle"];
for (const k of keys) {
  const n = i18n.split(`"${k}":`).length - 1;
  assert.ok(n >= 2, `i18n key ${k} must exist in EN and DE catalogs (found ${n})`);
}
assert.ok(i18n.includes('"Tab.Forms": "Formulare"'), "DE Tab.Forms translation missing");

// 8. styling: form fields are visually distinct + design-mode affordance
assert.ok(css.includes(".form-field"), ".form-field style missing");
assert.ok(css.includes("forms-design-mode"), "design-mode style missing");

console.log("All FX-U1 forms-tab tests passed!\n");
console.log("FORMS-PASS");
