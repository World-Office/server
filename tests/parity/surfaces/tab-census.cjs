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
// Contextual tabs (chart-design, header-footer) only render with a chart
// selection / header edit mode, so each runs a SETUP flow first (the same
// fixture + interaction the contract runner uses as its 'chart-selection' /
// 'hf-editing' pres) before its floor is counted. Setup tabs run LAST: their
// fixtures rewrite #editor.innerHTML, which must not perturb the plain-tab
// baselines above them.
'use strict';
const path = require('path');
const fs = require('fs');
const boot = require('../_boot.cjs');

const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'tab-census-floors.json'), 'utf8'));
const ALL_TABS = Object.keys(FLOORS).filter((t) => !t.startsWith('_'));

// Contextual tabs: how to make the tab button exist (unhide) and its page
// become active. Both flows reuse the proven contract-runner pres verbatim.
const CONTEXTUAL = {
  // chart-design appears only after clicking a chart vector object: the
  // editor click handler sets lastChartPick, unhides the tab and activates it.
  'chart-design': async (page) => {
    await page.evaluate(() => {
      const ed = document.querySelector('#editor');
      if (!ed) throw new Error('#editor missing');
      const spec = { type: 'bar', title: 'Fixture', rows: [['A', '1'], ['B', '2']], elements: {} };
      const img = '<img id="fixture-chart" class="vector-object" data-kind="chart" alt="chart" style="width:420px;height:240px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-spec="' + JSON.stringify(spec).replace(/"/g, '&quot;').replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;') + '">';
      ed.innerHTML = '<p>before ' + img + ' after</p>';
      ed.focus();
    });
    await page.waitForSelector('#fixture-chart', { timeout: 3000 });
    await page.locator('#fixture-chart').click({ timeout: 5000 });
    await page.waitForSelector('.ribbon-tab[data-tab="chart-design"]:not([hidden])', { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 200));
  },
  // header-footer appears only in header/footer edit mode: double-clicking a
  // .page-header runs enterHFMode, which unhides + activates the tab.
  'header-footer': async (page) => {
    await page.evaluate(() => {
      const ed = document.querySelector('#editor');
      if (!ed) throw new Error('#editor missing');
      ed.innerHTML = '<header class="page-header" id="fixture-hf"><p>Header text</p></header><p>body text</p>';
    });
    await page.waitForSelector('#fixture-hf', { timeout: 3000 });
    await page.locator('#fixture-hf').dblclick({ timeout: 5000 });
    await page.waitForSelector('.ribbon-tab[data-tab="header-footer"]:not([hidden])', { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 200));
  },
};
// plain tabs first, contextual (fixture-planting) tabs last
const TABS = [...ALL_TABS.filter((t) => !CONTEXTUAL[t]), ...ALL_TABS.filter((t) => CONTEXTUAL[t])];

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
    if (CONTEXTUAL[tab]) {
      try {
        await CONTEXTUAL[tab](page);
      } catch (e) {
        results[tab] = { count: 0, floor: FLOORS[tab], error: `setup failed: ${String(e && e.message || e).split('\n')[0]}` };
        rc = 1;
        continue;
      }
    }
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
