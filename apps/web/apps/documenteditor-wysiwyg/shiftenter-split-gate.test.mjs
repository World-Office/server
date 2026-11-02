#!/usr/bin/env node
// shiftenter-split-gate.test.mjs — static pins for BHV-002 (2026-11-02):
// "Shift+Enter gray background" — mashing Shift+Enter at a document end
// grew one <p> past the sheet's content height, but trySplitLines could
// only find split points via TEXT CHARACTERS (binary search over text
// offsets). <br>-only lines carry no chars, so the block read as
// unsplittable, paginateView "tolerated the overflow" (alone-on-sheet
// path), and the soft lines rendered past the sheet bottom onto the gray
// backdrop — typing on them showed text on the gray area.
//
// Live repro before the fix: type "hello" + 60×Shift+Enter → ONE .wo-page
// with the <p> overflowing +535px below the sheet. After: 2 sheets, zero
// overflow (verified with route-overridden editor.js against :8082).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "editor.js"), "utf8");

// Fix 1: br-bearing blocks are splittable even with <2 text chars
// (a pure soft-break paragraph has zero chars — total alone disqualified it).
assert.match(src, /total < 2 && blk\.querySelectorAll\("br"\)\.length === 0/,
  "trySplitLines must not reject br-bearing blocks by text-char count");

// Fix 2: the split point is found at a CHILD BOUNDARY too — the first child
// (text node, <br> or inline) that OPENS a line at/after `fit`. Range rects
// are EMPTY for <br>, so element children must report via
// getBoundingClientRect (the bug's second layer: the first attempt used
// range rects for <br> and never found a boundary).
assert.match(src, /const childLineSpan = \(ch\) =>/,
  "trySplitLines must measure each child's line span (boundary walk)");
assert.match(src, /if \(span\.first >= fit\) \{ boundary = blk\.childNodes\[i\]; break; \}/,
  "the first child opening a line at/after `fit` is the split boundary");
assert.match(src, /const b = ch\.getBoundingClientRect\(\);/,
  "element children (incl. <br>) report geometry via getBoundingClientRect");

// Fix 3: a br-only continuation fragment is real content (it renders
// lines) — the nothing-to-move restore must not swallow it.
assert.match(src,
  /!frag\.textContent\.trim\(\) && !frag\.querySelector\("img"\) &&\s*!frag\.querySelector\("br"\)/,
  "br-only split fragments must move to the next sheet, not be restored");

// Fix 4: the char binary search remains the path for children that WRAP
// across the split line (regression pin for ordinary wrapped text).
assert.match(src, /if \(span\.last >= fit\) \{ spanning = true; break; \}/,
  "wrapped-across children still route to the char split");

console.log("shiftenter-split-gate-PASS");
