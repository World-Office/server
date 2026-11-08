#!/usr/bin/env node
// tab-census.cjs — per-tab completeness gate.
//
// The 594-contract runner asserts individual controls exist and behave, but a
// whole ribbon page can still be EMPTY or leak another tab's panel without a
// single contract failing (that shipped to prod on 2026-11-08: prod served a
// 7-weeks-stale bundle where only Home looked right). This surface clicks
// every ribbon tab and asserts a per-tab floor of visible interactive
// controls inside the ACTIVE .ribbon-page, so "tab totally wrong" fails
// loudly with the tab named.
//
// Usage: node tests/parity/surfaces/tab-census.cjs [--base URL] [--results FILE]
// Contextual tabs (chart-design, header-footer) are skipped here: they only
// render with a chart selection / header edit mode and are covered by their
// own contract rows.
'use strict';
const path = require('path');
const fs = require('fs');
const boot = require('../_boot.cjs');

const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'tab-census-floors.json'), 'utf8'));
const TABS = Object.keys(FLOORS).filter((t) => !t.startsWith('_'));

function visible(n) {
  const r = n.getBoundingClientRect();
  const s = getComputedStyle(n);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !n.closest('[hidden]');
}

(async () => {
  const results = {};
  let rc = 0;
  await boot.ensureServer();
  const { browser, page } = await (async () => {
    const b = await boot.launchBrowser();
    const { page: p } = await boot.openEditor(b, boot.BASE);
    return { browser: b, page: p };
  })();
  for (const tab of TABS) {
    const tabBtn = await page.$(`.ribbon-tab[data-tab="${tab}"]`);
    if (!tabBtn) {
      results[tab] = { count: 0, floor: FLOORS[tab], error: 'tab button not found' };
      rc = 1;
      continue;
    }
    await tabBtn.click();
    await page.waitForTimeout(400);
    const count = await page.evaluate((t) => {
      const pg = document.querySelector(`.ribbon-page[data-tab="${t}"]`);
      if (!pg) return -1;
      const sels = pg.querySelectorAll('[data-cmd], button, select, input:not([type="hidden"])');
      return Array.from(sels).filter((n) => {
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      }).length;
    }, tab);
    const ok = count >= FLOORS[tab];
    if (!ok) rc = 1;
    results[tab] = { count, floor: FLOORS[tab], ok };
  }
  await browser.close();

  const outPath = process.argv.includes('--results')
    ? process.argv[process.argv.indexOf('--results') + 1]
    : path.join(__dirname, '..', 'tab-census-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));

  for (const [t, v] of Object.entries(results)) {
    const mark = v.ok === false || v.error ? 'FAIL' : 'ok';
    console.log(`${mark.padEnd(5)} ${t.padEnd(14)} ${String(v.count).padStart(4)} controls (floor ${v.floor})${v.error ? ` — ${v.error}` : ''}`);
  }
  const fails = Object.entries(results).filter(([, v]) => v.ok === false || v.error).length;
  console.log(`tab-census: ${TABS.length - fails}/${TABS.length} tabs at or above floor`);
  process.exit(rc);
})();
