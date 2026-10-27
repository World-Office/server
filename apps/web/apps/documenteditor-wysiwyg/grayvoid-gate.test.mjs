#!/usr/bin/env node
// grayvoid-gate.test.mjs — static pins for the 2026-10-27 prod incident:
// "teh quikc brown foxx … second block" stranded in the gray area outside
// the document page (https://editor.cloud.graphwiz.ai/word/).
//
// Incident chain this gate protects:
//   1. pollCollab's first applyRemoteText() wiped the freshly loaded doc
//      (hub held an empty/poisoned baseline for session "")
//   2. paginateView early-returned on zero blocks -> NO .wo-page at all ->
//      an empty contenteditable #editor ("gray void") received the typing
//   3. stray text synced back into the hub and poisoned every later boot
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "editor.js"), "utf8");

// Fix 1: empty remote text never replaces a non-empty document.
assert.ok(
  /Data-destruction guard/.test(src),
  "applyRemoteText documents the data-destruction guard",
);
assert.ok(
  src.includes('if (!(text || "").trim() && (current || "").trim()) {'),
  "applyRemoteText rejects empty-remote-over-nonempty-local",
);
assert.ok(
  /function applyRemoteText[\s\S]{0,600}collabSync\(\)/.test(src),
  "the empty-text guard calls collabSync (push local, server diff-merges)",
);

// Fix 2: a wiped document still renders ONE page sheet — no gray void.
assert.ok(
  /blocks\.length === 0\) \{\s*\n\s*openPage\(\);\s*\n\s*return;/.test(src),
  "paginateView emits an empty .wo-page when there are no blocks",
);

// Fix 3: a first-poll hub mismatch (never-seen ops) is treated as a
// poisoned/stale baseline -> push local instead of converging down.
assert.ok(
  /firstPollMismatch = lastSeenOpCount < 0/.test(src) &&
  /\(opCountDropped \|\| firstPollMismatch\)/.test(src),
  "pollCollab first-poll mismatch pushes the local snapshot",
);

console.log("grayvoid-gate: OK");
