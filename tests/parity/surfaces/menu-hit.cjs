// surfaces/menu-hit.cjs — L4 surface probe.
// Guards contract area: presence + elementFromPoint hit-test for every
// ribbon tab button, and that each tab actually switches its ribbon page.
// Regression caught here: tabs click-dead (elementFromPoint misses the
// button → "BLOCKED by ribbon-row", 2026-10-13 fix 66a3e9d98).
'use strict';
const { ensureServer, launchBrowser, openEditor } = require('../_boot.cjs');

const TABS = ['home', 'insert', 'draw', 'layout', 'references', 'collaboration', 'protection', 'view', 'plugins', 'ai', 'header-footer'];

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  const { page } = await openEditor(browser, server.base);
  let fails = 0;
  for (const tab of TABS) {
    const r = await page.evaluate((t) => {
      const btn = document.querySelector(`.ribbon-tab[data-tab="${t}"]`);
      if (!btn) return { ok: false, why: 'tab button missing' };
      const b = btn.getBoundingClientRect();
      const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      if (!el || !el.closest('.ribbon-tab')) return { ok: false, why: 'BLOCKED by ' + (el ? el.className : 'nothing') };
      btn.click();
      const pg = document.querySelector(`.ribbon-page[data-tab="${t}"]`);
      const vis = pg && getComputedStyle(pg).display !== 'none';
      return { ok: !!vis, why: vis ? `${pg.querySelectorAll('button,[role=button],input,select').length} controls` : 'page did not show' };
    }, tab);
    if (!r.ok) fails++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} tab ${tab}: ${r.why}`);
  }
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });
