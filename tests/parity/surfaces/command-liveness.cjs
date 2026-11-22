#!/usr/bin/env node
// command-liveness.cjs — dead-control gate (react-native).
//
// Every data-cmd control the RIBBON ships must be WIRED: either handled
// by the react command dispatcher (word-commands.ts / rte-command.ts and
// friends) or a native execCommand the browser reports supported.
// Anything else is a silent no-op — the react dispatcher even logs
// `[word-commands] unhandled command:` for those, so this gate catches
// the "looks fine superficially" failure class BEFORE the click.
//
// Since the react editor ships as JS (no static index.html with data-cmd),
// the "shipped controls" leg runs in the booted editor: click every ribbon
// tab (mounting lazy pages) and collect data-cmd from the live DOM. The
// "handled" leg is a static scan of ALL command-string literals the react
// dispatchers compare against (case "..." / === "..." / == "...").
// dead = DOM - handled - native.
//
// Usage: node tests/parity/surfaces/command-liveness.cjs
'use strict';
const path = require('path');
const fs = require('fs');
// Mirror af-gate.sh's docserver fallback so the surface can run standalone
// from a worktree with no cargo build of its own.
const LOCAL_BIN = path.join(__dirname, '..', '..', 'target', 'debug', 'wo-docserver');
const MAIN_BIN = '/home/weiss/git/World-Office/server/target/debug/wo-docserver';
if (!process.env.WO_DOCSERVER_BIN && !fs.existsSync(LOCAL_BIN) && fs.existsSync(MAIN_BIN)) {
  process.env.WO_DOCSERVER_BIN = MAIN_BIN;
}
// And stage the built react bundle like af-gate.sh does (docserver serves
// /word/ from $EDITOR_UI_DIR/word). Must happen BEFORE requiring _boot.cjs:
// it captures EDITOR_UI_DIR at module load.
if (!process.env.EDITOR_UI_DIR || !fs.existsSync(path.join(process.env.EDITOR_UI_DIR, 'word', 'index.html'))) {
  const stage = fs.mkdtempSync('/tmp/wo-parity-ui-');
  fs.symlinkSync('/home/weiss/git/World-Office/server/apps/web/apps/documenteditor-react/dist', path.join(stage, 'word'));
  process.env.EDITOR_UI_DIR = stage;
}

const boot = require('../_boot.cjs');

const APP = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'apps', 'documenteditor-react', 'src', 'lib');
const DISPATCH_FILES = ['word-commands.ts', 'rte-command.ts', 'content-controls.ts', 'form-status.ts', 'section-break.ts', 'conversion.ts'];

const RX = /(["'`])([A-Za-z][A-Za-z0-9._-]*)\1\s*(?:===|==)\s*(["'`])?[A-Za-z]|case\s+["'`]([A-Za-z][A-Za-z0-9._-]*)["'`]/g;

function handledCmds() {
  const out = new Set();
  for (const f of DISPATCH_FILES) {
    const p = path.join(APP, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/case\s+["'`]([^"'`]+)["'`]:/g)) out.add(m[1]);
    for (const m of src.matchAll(/\b(command|cmd)\s*(?:===|==)\s*["'`]([^"'`]+)["'`]/g)) out.add(m[2]);
    for (const m of src.matchAll(/["'`]([^"'`]+)["'`]\s*(?:===|==)\s*\b(command|cmd)\b/g)) out.add(m[1]);
  }
  return out;
}

(async () => {
  const sHandled = handledCmds();
  await boot.ensureServer();
  const browser = await boot.launchBrowser();
  const { page } = await boot.openEditor(browser, boot.BASE);

  // 1) shipped controls: click every ribbon tab, collect visible data-cmd
  const tabs = await page.$$eval('.ribbon-tab', (els) => els.map((e) => e.getAttribute('data-tab')).filter(Boolean));
  const domCmds = new Set();
  for (const tab of tabs) {
    const btn = await page.$(`.ribbon-tab[data-tab="${tab}"]`);
    if (btn) {
      await btn.click();
      await page.waitForTimeout(250);
    }
    const cmds = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-cmd]'))
        .map((n) => n.getAttribute('data-cmd'))
        .filter(Boolean));
    for (const c of cmds) domCmds.add(c);
  }

  // 2) native execCommand leg (bold/italic/undo/… route to the engine)
  const candidates = [...domCmds].filter((c) => !sHandled.has(c));
  const native = await page.evaluate((cmds) => {
    const ok = new Set();
    for (const c of cmds) {
      try { if (document.queryCommandSupported(c)) ok.add(c); } catch { /* engines throw on odd names */ }
    }
    return [...ok];
  }, candidates);
  await browser.close();

  const dead = candidates.filter((c) => !native.includes(c));
  const results = {
    generatedAt: new Date().toISOString(),
    total: domCmds.size,
    handledStatic: [...domCmds].filter((c) => sHandled.has(c)).length,
    nativeOnly: native.length,
    dead,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'command-liveness-results.json'), JSON.stringify(results, null, 1));

  console.log(`command-liveness: ${domCmds.size} shipped data-cmd controls, ${results.handledStatic} wired in react dispatchers, ${results.nativeOnly} native execCommand${native.length ? ` (${native.join(',')})` : ''}`);
  if (dead.length) {
    console.error(`command-liveness: DEAD CONTROLS (${dead.length}) — data-cmd with no handler and no native support. The dispatcher logs each as "unhandled command":`);
    for (const c of dead) console.error(`  - ${c}`);
    process.exit(1);
  }
  console.log('command-liveness: ok — no dead controls');
  process.exit(0);
})();
