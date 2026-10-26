import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
// BUG2-RUNTIME-SMOKE: scripts/smoke.mjs is the live full-surface runtime
// smoke driver (manual: `node scripts/smoke.mjs`; needs headless Chromium via
// the shared test harness). This gate is intentionally thin — it only proves
// the driver stays in the tree and keeps driving every real surface.
const file = "scripts/smoke.mjs";
assert.ok(existsSync(file), "scripts/smoke.mjs exists");
const src = readFileSync(file, "utf8");

// full-surface coverage: ribbon buttons, menus, dialogs, ctx rows, panel
for (const sel of [
  ".ribbon-tab",                       // tab switching
  ".ribbon-page",                      // per-tab button sweeps
  "button[data-cmd]",                  // every ribbon command
  ".menu-list",                        // every rb-menu row
  ".dialog-overlay",                   // every dialog (open/primary/cancel/Esc)
  "#ctx-menu",                         // context menu rows
  "#right-rail",                       // panel rail sections
  "data-panel",                        // rail section buttons
]) {
  assert.ok(src.includes(sel), `smoke.mjs references ${sel}`);
}

// error capture + report contract
assert.ok(src.includes("pageerror"), "captures pageerror");
assert.ok(src.includes('type === "error"'), "captures console.error");
assert.ok(src.includes("{ action: name, ok: false, errors: [] }"),
  "dumps {action, ok, errors[]} report");
assert.ok(src.includes("playwright"), "loads playwright from the shared harness");

console.log("smoke-gate: scripts/smoke.mjs present + full-surface selectors wired");
