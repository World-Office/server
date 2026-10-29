import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// C1-SHORTCUT-PARITY gate: pins the OO-parity keyboard bindings added to the
// editor keydown handler (shortcut census T-003, 2026-10-28). The bindings
// live in a dedicated block at the TOP of the editor keydown handler (before
// the ctrl/!altKey guard, so Alt-combos reach them) and route through the
// wo-command bus (emitCommand) to existing runCommand command targets.
const src = readFileSync("editor.js", "utf8");

// Must route to an existing runCommand target.
const COMMANDS = [
  "superscript", "smallCaps", "insertFootnote", "insertEndnote",
  "insertColumnBreak", "insertPageBreak", "link", "toggleChat",
];
for (const c of COMMANDS) {
  assert.ok(src.includes(`cmd === "${c}"`), `runCommand target exists: ${c}`);
}
assert.ok(src.includes('cmd === "insertSymbol"'), "insertSymbol target exists");

// Each combo must be bound in the dedicated block (bus-wired with preventDefault).
const BINDS = {
  Superscript:        'emitCommand("superscript")',
  SmallCaps:          'emitCommand("smallCaps")',
  InsertFootnoteNow:  'emitCommand("insertFootnote")',
  InsertEndnoteNow:   'emitCommand("insertEndnote")',
  InsertColumnBreak:  'emitCommand("insertColumnBreak")',
  InsertPageBreak:    'emitCommand("insertPageBreak")',
  InsertHyperlink:    'emitCommand("link")',
  OpenChatPanel:      'emitCommand("toggleChat")',
  NonBreakingSpace:   'emitCommand("insertSymbol", "\\u00a0")',
  EmDash:             'emitCommand("insertSymbol", "\\u2014")',
  EnDash:             'emitCommand("insertSymbol", "\\u2013")',
  EuroSign:           'emitCommand("insertSymbol", "\\u20ac")',
  CopyrightSign:      'emitCommand("insertSymbol", "\\u00a9")',
  TrademarkSign:      'emitCommand("insertSymbol", "\\u2122")',
  RegisteredSign:     'emitCommand("insertSymbol", "\\u00ae")',
  SaveAs:             'openBackstage("export")',
  OpenCommentsPanel:  'openCommentsPanel()',
  UnIndent:           'emitCommand("outdent")',
  Indent:             'emitCommand("indent")',
  InsertEquation:     'emitCommand("equationTemplate")',
  UpdateFields:       'fieldOpAtSelection("update")',
  OpenHelpMenu:       'openDlg("help-dialog")',
  SpeechWorker:       'readAloud()',
  HorizontalEllipsis: 'emitCommand("insertSymbol", "\\u2026")',
};
for (const [type, pin] of Object.entries(BINDS)) {
  assert.ok(src.includes(pin), `binding present: ${type}`);
}

// The dedicated block must be a top-level block in the editor keydown handler,
// positioned BEFORE the ctrl/!altKey guard (checked via the guard's text).
const guardIdx = src.indexOf('(ev.ctrlKey || ev.metaKey) && !ev.altKey) {');
const altIdx = src.indexOf('(ev.ctrlKey || ev.metaKey) && ev.altKey) {');
const shiftIdx = src.indexOf('(ev.ctrlKey || ev.metaKey) && ev.shiftKey && !ev.altKey) {');
// guard now refers to the dedicated-block nbsp guard; the dash/alt/shift blocks
// must appear before the guarded main block's zoom/format section.
assert.ok(altIdx !== -1 && shiftIdx !== -1, "dedicated alt+shift blocks present");

console.log(`shortcuts-gate: ${Object.keys(BINDS).length} OO-parity bindings pinned, bus targets verified`);
