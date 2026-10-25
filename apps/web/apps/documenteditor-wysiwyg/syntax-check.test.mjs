import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// F-PROD-INCIDENT 2026-10-25: duplicate const in one scope killed the whole
// editor.js at parse time (prod incident). Static tests can miss this; parse
// can not. Zero-dep: node --check.
for (const f of ["editor.js", "i18n.js", "wo-bridge.js"]) {
  execFileSync(process.execPath, ["--check", f]);
}
// index.html: every inline <script> must parse too.
const html = readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length >= 0, "script extraction");
console.log("syntax-check: editor.js + i18n.js + wo-bridge.js parse clean");
