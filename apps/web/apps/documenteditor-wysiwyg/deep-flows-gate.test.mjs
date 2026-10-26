/**
 * deep-flows-gate.test.mjs — thin static gate for the deep-flows driver.
 *
 * The driver itself (scripts/deep-flows.mjs) is live-only per house convention
 * (Playwright + real browser); this gate pins its critical wiring so a broken
 * refactor fails fast in the *.test.mjs acceptance run.
 *
 * Run: node deep-flows-gate.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- driver exists and keeps its key wiring ---------------------------------
const driverPath = resolve(HERE, "scripts", "deep-flows.mjs");
assert.ok(existsSync(driverPath), "scripts/deep-flows.mjs must exist");
const code = readFileSync(driverPath, "utf8");

for (const needle of [
  // harness recipe (smoke.mjs conventions)
  "18047", "/usr/bin/python3", "http.server", "addInitScript",
  // stubbed backend capture
  "__API_CALLS__", "__STUB_STATE__", "/save(", "versions",
  // flow a: find & replace
  "#find-query", "#find-match-case", "#btn-find-next", "#btn-find-replace",
  "#btn-find-replace-all", "#btn-find-close", "al.ha",
  // flow b: version history
  "#btn-history", ".version-restore", "Version restored ✓", "rolled back body",
  // flow c: comments
  "#btn-comment", "#btn-comment-ok", ".reply-textarea", "data-replies",
  "data-resolved", ".sb-add-comment",
  // flow d: track changes
  "#sb-track-changes", "ins.track-insert", "del.track-delete",
  "nextTrackedChange", "prevTrackedChange", "#review-panel",
  "review-insert", "review-delete",
  // flow e: zoom (incl. the two BUG5 fixes)
  "#sb-zoom-label", "WheelEvent", "ctrlKey", "Control+0", "#btn-zoom-fit",
  "innerWidth - 96", "wo-zoom",
  // flow f: save & export
  "#btn-save", "Saved ✓", "wo-misspelled", "data-word", "data-export",
  "format=${fmt}", "#btn-file",
  // flow g: keyboard sweep
  "#twin-a", "#twin-b", "Control+b", "Control+Shift+l", "Control+Shift+7",
  "Control+Shift+8", "Control+Equal", "clipboard",
]) {
  assert.ok(code.includes(needle), `deep-flows.mjs must reference ${needle}`);
}

// --- editor.js keeps the BUG5 flow fixes ------------------------------------
const editorJs = readFileSync(resolve(HERE, "editor.js"), "utf8");
assert.ok(editorJs.includes('k === "0" && !ev.shiftKey'), "Ctrl+0 zoom-reset keydown branch present");
assert.ok(editorJs.includes('addEventListener("wheel"'), "editor Ctrl+wheel zoom listener present");

// --- index.html shortcut surface sanity --------------------------------------
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
assert.ok(
  html.includes('aria-keyshortcuts="Control+0"'),
  "btn-zoom-reset advertises Control+0 (new binding)",
);
const printTag = html.match(/<button[^>]*id="btn-print-qa"[^>]*>/);
assert.ok(printTag, "print button present");
assert.ok(
  !printTag[0].includes("aria-keyshortcuts"),
  "print button intentionally claims no shortcut (browser default Ctrl+P untouched)",
);

console.log("deep-flows-gate: driver wiring, BUG5 fixes, shortcut surface OK");
