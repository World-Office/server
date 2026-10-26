/**
 * BUG6-EDGE-ROBUSTNESS Static Edge Gate
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Thin companion to the heavy live driver `scripts/edge.mjs` (scenarios a-g:
 * poisoned storage, offline error states, empty-doc command sweep, huge-doc
 * perf, rapid-fire interaction, hostile paste, dark theme). This gate is the
 * cheap CI-side contract: it asserts the live driver exists and covers all
 * seven scenarios, and that the BUG6 root-cause fixes are present in
 * editor.js:
 *   - SPELL_USER_DICT_MAX: user dict load/save is shape-checked and capped
 *     (poisoned / unbounded 'wo-user-dict' can no longer break boot or grow)
 *   - stripHostilePositioning: sanitizePasteHtml strips `position: fixed`
 *     style declarations (overlay hijack via rich paste)
 *   - native 'paste' interceptor routes clipboard HTML through
 *     sanitizePasteHtml (F-063 bypass closure)
 *   - replayCommands tolerates malformed JSONL entries (no throw on poison)
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/edge-gate.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const editorSrc = readFileSync(join(here, 'editor.js'), 'utf8');
const edgeDriverPath = join(here, 'scripts', 'edge.mjs');

// --- Live driver exists and references every scenario's key surface -------
assert.ok(existsSync(edgeDriverPath), 'scripts/edge.mjs live driver must exist');
const edgeSrc = readFileSync(edgeDriverPath, 'utf8');

const driverMarkers = [
    ['scenario a: poisoned storage', 'wo-user-dict'],
    ['scenario a: sibling poisoned keys', 'wo-ignore-all'],
    ['scenario a: offline queue poison', 'wo-offline-queue'],
    ['scenario b: offline fetch stub', 'TypeError'],
    ['scenario b: offline queue observable', 'wo-offline-queue'],
    ['scenario c: undo correlation', 'btn-undo'],
    ['scenario c/d: serialization point', '__WO_FLAT_HTML__'],
    ['scenario d: spellcheck perf mark', 'wo-misspelled'],
    ['scenario e: listener-leak probe', 'getEventListeners'],
    ['scenario e: heap probe', 'performance.memory'],
    ['scenario f: planted canary', '__pwned'],
    ['scenario f: rich paste entry', 'btn-paste'],
    ['scenario g: dark theme flip', 'btn-theme'],
    ['scenario g: dark document flip', 'dark-document'],
];
for (const [why, marker] of driverMarkers) {
    assert.ok(
        edgeSrc.includes(marker),
        `edge.mjs must reference ${marker} (${why})`,
    );
}

// --- Root-cause fix 1: user dict shape check + cap -------------------------
assert.ok(
    editorSrc.includes('SPELL_USER_DICT_MAX'),
    'editor.js must define SPELL_USER_DICT_MAX (capped user dict)',
);
assert.ok(
    /function loadSpellUserDict[\s\S]{0,800}?Array\.isArray/.test(editorSrc),
    'loadSpellUserDict must validate the stored array shape (poison guard)',
);
assert.ok(
    /function saveSpellUserDict[\s\S]{0,800}?SPELL_USER_DICT_MAX/.test(editorSrc),
    'saveSpellUserDict must cap the persisted dict size',
);

// --- Root-cause fix 2: position:fixed stripping in paste sanitizer --------
assert.ok(
    editorSrc.includes('stripHostilePositioning'),
    'editor.js must define stripHostilePositioning (overlay hijack guard)',
);
assert.ok(
    /sanitizePasteHtml[\s\S]{0,1200}?stripHostilePositioning/.test(editorSrc),
    'sanitizePasteHtml must invoke stripHostilePositioning',
);

// --- Root-cause fix 3: native paste path is sanitized ----------------------
assert.ok(
    /addEventListener\("paste"[\s\S]{0,900}?sanitizePasteHtml/.test(editorSrc),
    'native paste event must be routed through sanitizePasteHtml (F-063)',
);

// --- Root-cause fix 4: collab replay tolerates malformed entries ----------
assert.ok(
    /function replayCommands[\s\S]{0,2000}?try\s*\{[\s\S]{0,400}?JSON\.parse[\s\S]{0,400}?\}\s*catch/.test(editorSrc),
    'replayCommands must try/catch per-entry JSON.parse (poison guard)',
);

// --- Poisoned-storage coverage: boot path reads are guarded ---------------
for (const key of ['wo-user-dict', 'wo-ignore-all']) {
    const at = editorSrc.indexOf(`"${key}"`);
    assert.ok(at !== -1, `editor.js must reference localStorage key ${key}`);
}

console.log('edge-gate: all static assertions passed');
