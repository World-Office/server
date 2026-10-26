#!/usr/bin/env node
// consistency-gate.test.mjs — thin static gate for scripts/consistency.mjs
// (RES2-EDITOR-RESIDUALS deliverable; house convention: heavy live drivers
// stay scripts/*.mjs, static pins live in *.test.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

const probe = read("scripts/consistency.mjs");
const editor = read("editor.js");
const css = read("style.css");
const html = read("index.html");

// The live driver exists and carries the convergence machinery.
assert.ok(/convergencePair/.test(probe), "consistency.mjs defines convergencePair");
assert.ok(/freePort/.test(probe) && /listen\(0/.test(probe), "freePort falls back to an OS-assigned port, never literal 0");
assert.ok(/addInitScript/.test(probe), "consistency.mjs stubs fetch before page load");

// BUG8/RES2 editor fix anchors must survive refactors:
// 1. image-alt dialog captures its target at open (dialog input steals selection)
assert.ok(/imageAltTarget/.test(editor), "imageAltTarget captured at dialog open");
assert.ok(/applyImageAltText\(altValue, imageAltTarget\)/.test(editor), "alt apply funnel receives the captured target");
assert.ok(/applyImageSize\(parseFloat\(wIn\.value\), parseFloat\(hIn\.value\), imageAltTarget\)/.test(editor), "image size apply receives the captured target");
// 2. right-panel chart width preserves aspect (NaN height) like chart-design
assert.ok(/applyChartSize\(parseFloat\(rpChartWidth\.value\), NaN\)/.test(editor), "rp chart width change passes NaN height (aspect preserve)");
// 3. orphaned drag-resize handle cluster deleted (RES2)
assert.ok(!/showImageResizeHandle/.test(editor), "showImageResizeHandle dead cluster removed");
// 4. ctx menu viewport clamp (same class as dialog clamp)
assert.ok(/#ctx-menu/.test(css) && /max-height: calc\(100vh - 8px\)/.test(css), "ctx-menu max-height clamp in style.css");

// The alt/wrap/size surfaces referenced by the probe exist in markup.
assert.ok(/image-alt-dialog/.test(html), "image-alt-dialog present");
assert.ok(/image-alt-input/.test(html), "image-alt-input present");
assert.ok(/id="btn-image-alt-ok"/.test(html), "btn-image-alt-ok present");
assert.ok(/rp-chart-width/.test(html), "rp-chart-width present");

console.log("consistency-gate: OK");
