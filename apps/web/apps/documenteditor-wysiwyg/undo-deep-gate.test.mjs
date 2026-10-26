/**
 * BUG7-UNDO-DEEP Static History-Fidelity Gate
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Thin companion to the heavy live driver `scripts/undo-deep.mjs` (80 probes
 * over feature groups a-f: text formatting, alignment/indents/lists, objects,
 * document structure, review/collab, paste + select-all; each probe asserts
 * depth delta 1, undo restores the pre-apply DOM, redo restores post-apply).
 * This gate is the cheap CI-side contract: it asserts the live driver exists
 * and covers every group and harness surface, and that the BUG7 root-cause
 * fixes are present in editor.js:
 *   - captureHistory identical-HTML dedupe (phantom-entry guard)
 *   - window.__WO_HISTORY__ automation hook (depth/snapshot/reset)
 *   - applyListStyle single-step guard (suppressInputCapture) — list
 *     creation + restyle used to push TWO entries
 *   - toolbar data-cmd dispatcher skips .rb-menu rows — footnote/endnote/
 *     pagenumber buttons used to fire twice (doubled markup, 2 entries)
 *   - updateActiveStates resets font family/size selects to placeholder
 *     when the caret font matches no preset (stale toolbar after undo)
 *   - comments-panel reply pushes history (data-replies is persisted
 *     content; the reply used to be silent and not undoable)
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/undo-deep-gate.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const editorSrc = readFileSync(join(here, 'editor.js'), 'utf8');
const driverPath = join(here, 'scripts', 'undo-deep.mjs');

// --- Live driver exists and covers every group + harness surface ----------
assert.ok(existsSync(driverPath), 'scripts/undo-deep.mjs live driver must exist');
const driverSrc = readFileSync(driverPath, 'utf8');

const driverMarkers = [
  // probe contract: reset -> prime -> measure -> apply -> delta/undo/redo
  ['probe contract: depth expectation', 'expectDepth'],
  ['probe contract: no-op skip', 'skipDepth'],
  ['probe contract: post-apply asserts', 'afterApply'],
  ['probe contract: history getter', '__WO_HISTORY__'],
  ['probe contract: normalization', '__norm'],
  ['group a: formatting', 'group a —'],
  ['group a: keyboard parity', 'Control+Shift+z'],
  ['group a: color vaults on change', 'setVault'],
  ['group b: alignment/indents/lists', 'group b —'],
  ['group b: list style', 'insertOrderedList'],
  ['group c: objects', 'group c —'],
  ['group c: image file input', 'setInputFiles'],
  ['group c: 1px png fixture', 'PNG_1PX'],
  ['group c: vector object wait', 'img.vector-object'],
  ['group d: document structure', 'group d —'],
  ['group d: hr (ctx-menu-only cmd)', 'emitCmd'],
  ['group d: TOC dialog', 'btn-toc-ok'],
  ['group d: page setup', 'btn-ps-apply'],
  ['group e: review/collab', 'group e —'],
  ['group e: comment thread', 'data-replies'],
  ['group e: resolve/delete comment', 'resolveComment'],
  ['group e: accept/reject tracked', 'acceptTrackedChange'],
  ['group e: tracked typing path', 'rejectTrackedChange'],
  ['group e: mode setter (not blind toggle)', 'setTrack'],
  ['group f: paste + select-all', 'group f —'],
  ['group f: rich paste event', 'new ClipboardEvent'],
  ['group f: tracked paste path', 'insertFromPaste'],
  ['group f: real clipboard permissions', 'grantPermissions'],
  ['group f: select-all single entry', 'selectAll'],
  ['group f: caret placement helper', 'caretBeforeWord'],
];
for (const [why, marker] of driverMarkers) {
  assert.ok(driverSrc.includes(marker), `undo-deep.mjs must cover ${why} (${marker})`);
}

// --- editor.js keeps the BUG7 root-cause fixes -----------------------------

// Phantom guard: identical HTML must not push a history entry.
assert.ok(editorSrc.includes('if (html === lastSnapshot) return'),
  'captureHistory must dedupe identical snapshots (phantom-entry guard)');

// Automation hook over the history chain (probes + tests read it).
assert.ok(editorSrc.includes('window.__WO_HISTORY__ = {'),
  'window.__WO_HISTORY__ hook must exist');

// Group B fix: list create+restyle is ONE step, input capture suppressed.
assert.ok(editorSrc.includes('let suppressInputCapture = false'),
  'applyListStyle single-step guard flag must exist');
assert.ok(editorSrc.includes('if (bulkEdit || suppressInputCapture) return;'),
  'input-event capture must honor suppressInputCapture');

// Group D fix: dispatcher skips .rb-menu rows (no double-wired buttons).
assert.ok(editorSrc.includes('if (btn.closest(".rb-menu")) return;'),
  'data-cmd dispatcher must skip .rb-menu rows (double-insert guard)');

// Group A fix: stale toolbar selects reset to placeholder after undo.
assert.ok(editorSrc.includes('famEl.value = matched'),
  'font-family select must resolve to placeholder when no preset matches');
assert.ok(editorSrc.includes('sizeEl.value ='),
  'font-size select must reset when the caret font has no preset');

// Group E fix: replies are persisted content and must push history.
assert.ok(editorSrc.includes('BUG7-UNDO-DEEP: a reply mutates persisted document content'),
  'reply handler must carry the history-push regression guard');

console.log('undo-deep-gate: OK (driver wiring + BUG7 fixes pinned)');
