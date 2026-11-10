/**
 * FX-U1 gate: Save as form (.docxf) — File > "Save as form…" route,
 * save-form-dialog, POST /api/documents/{id}/save-form. Node built-in
 * assert, zero dependencies, static source contract (AF3-STATUSBAR house
 * style). Final line SAVEFORM-PASS iff every check holds.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf-8");
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8");
const docserver = readFileSync(
  new URL("../../../../core/crates/wo-docserver/src/render.rs", import.meta.url), "utf-8");

console.log("Running FX-U1 save-form tests...\n");

// 1. File > Save as form… entry point (backstage)
assert.ok(html.includes('id="btn-save-form"'), "backstage btn-save-form missing");
assert.ok(html.includes('data-i18n="Menu.SaveAsForm"'), "Menu.SaveAsForm marker missing");

// 2. the dialog: overlay, title, name field, cancel/save buttons
assert.ok(html.includes('id="save-form-dialog"'), "save-form-dialog missing");
assert.ok(/id="save-form-dialog"[^>]*role="dialog"/.test(html), "dialog must be role=dialog");
assert.ok(html.includes('id="save-form-name"'), "save-form-name input missing");
assert.ok(html.includes('id="save-form-dialog-title"'), "dialog title missing");
assert.ok(html.includes('id="btn-save-form-cancel"'), "cancel button missing");
assert.ok(html.includes('id="btn-save-form-ok"'), "ok button missing");
assert.ok(/id="btn-save-form-ok"[^>]*class="primary"/.test(html), "save button must be primary");
assert.ok(html.includes('data-i18n="Backstage.SaveAs.Label"'), "file-name label marker missing");

// 3. editor wiring: open/close/save + button listeners + cmd routes
assert.ok(/function openSaveFormDialog\(/.test(js), "openSaveFormDialog missing");
assert.ok(/function closeSaveFormDialog\(/.test(js), "closeSaveFormDialog missing");
assert.ok(/function saveForm\(/.test(js), "saveForm missing");
assert.ok(js.includes('cmd === "saveForm"'), "saveForm cmd route missing");
assert.ok(js.includes('value === "save-form"'), "openFilePane save-form route missing");
for (const id of ["btn-save-form", "btn-save-form-cancel", "btn-save-form-ok"]) {
  assert.ok(js.includes(`getElementById("${id}")`), `${id} listener wiring missing`);
}

// 4. default name derives from the current DOC_NAME (.docxf)
assert.ok(/\.docxf/.test(js), "default .docxf extension missing");
assert.ok(js.includes('DOC_NAME.replace(/\\.[^.]+$/, "")'), "DOC_NAME-derived default name missing");

// 5. empty name is rejected (validation at trust boundary)
assert.ok(js.includes("Please enter a file name"), "empty-name validation missing");

// 6. POST contract: api("save-form"), JSON body {filename, content}
assert.ok(js.includes('api("save-form")'), "api(save-form) endpoint missing");
assert.ok(js.includes("method: \"POST\""), "POST method missing");
assert.ok(js.includes("filename:"), "filename payload field missing");
assert.ok(js.includes("content: editor.innerHTML"), "content payload field missing");

// 7. i18n: title + desc + dialog buttons in BOTH catalogs
for (const k of ["FileScreen.TitleSaveForm", "FileScreen.DescSaveForm", "Menu.SaveAsForm", "Backstage.SaveAs.Label"]) {
  const n = i18n.split(`"${k}":`).length - 1;
  assert.ok(n >= 2, `i18n key ${k} must exist in EN and DE catalogs (found ${n})`);
}
assert.ok(i18n.includes('"FileScreen.TitleSaveForm": "Als Formular speichern"'), "DE dialog title missing");

// 8. backend contract: wo-docserver exposes POST /api/documents/{id}/save-form
assert.ok(docserver.includes("POST /api/documents/{id}/save-form"), "docserver save-form route missing");
assert.ok(/save.form/i.test(docserver), "docserver save-form handler missing");

console.log("All FX-U1 save-form tests passed!\n");
console.log("SAVEFORM-PASS");
