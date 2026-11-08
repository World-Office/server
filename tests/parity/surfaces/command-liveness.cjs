#!/usr/bin/env node
// command-liveness.cjs — dead-control gate.
//
// Every data-cmd control shipped in index.html must be WIRED: either it is a
// special branch in editor.js's runCommand (cmd === "x" literal), a dedicated
// dataset.cmd handler, or a native execCommand the browser reports supported.
// Anything else is a silent no-op — exactly the "looks fine superficially"
// failure class (the loud-stub doctrine in runCommand already warns on the
// runtime path; this gate catches it BEFORE the click, at CI time).
//
// Zero-mutation: nothing is clicked or dispatched — three static/runtime legs:
//   S_html     data-cmd values in index.html (whole file incl. menus/dialogs)
//   S_handled  cmd literals + dataset.cmd comparisons in editor.js
//   S_native   document.queryCommandSupported(cmd) probed in the booted editor
// dead = S_html - S_handled - S_native
//
// Usage: node tests/parity/surfaces/command-liveness.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const boot = require('../_boot.cjs');

const APP = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'apps', 'documenteditor-wysiwyg');

function htmlCmds() {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const out = new Set();
  for (const m of html.matchAll(/data-cmd="([^"]+)"/g)) out.add(m[1]);
  return out;
}

function handledCmds() {
  const js = fs.readFileSync(path.join(APP, 'editor.js'), 'utf8');
  const out = new Set();
  for (const m of js.matchAll(/cmd === "([^"]+)"/g)) out.add(m[1]);
  for (const m of js.matchAll(/dataset\.cmd === "([^"]+)"/g)) out.add(m[1]);
  // buttons wired by selector rather than dispatcher still name their cmd
  for (const m of js.matchAll(/data-cmd="([^"]+)"/g)) out.add(m[1]);
  return out;
}

(async () => {
  const sHtml = htmlCmds();
  const sHandled = handledCmds();
  const candidates = [...sHtml].filter((c) => !sHandled.has(c));

  // third leg: native execCommand support, probed inside the booted editor
  await boot.ensureServer();
  const browser = await boot.launchBrowser();
  const { page } = await boot.openEditor(browser, boot.BASE);
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
    total: sHtml.size,
    handledStatic: [...sHandled].filter((c) => sHtml.has(c)).length,
    nativeOnly: native.length,
    dead,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'command-liveness-results.json'), JSON.stringify(results, null, 1));

  console.log(`command-liveness: ${sHtml.size} data-cmd controls, ${results.handledStatic} wired in editor.js, ${results.nativeOnly} native execCommand`);
  if (dead.length) {
    console.error(`command-liveness: DEAD CONTROLS (${dead.length}) — data-cmd with no handler and no native support:`);
    for (const c of dead) console.error(`  - ${c}`);
    process.exit(1);
  }
  console.log('command-liveness: ok — no dead controls');
  process.exit(0);
})();
