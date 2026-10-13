// surfaces/tab-switch-widths.cjs — L4 surface probe.
// Guards contract area: ribbon integrity across viewport widths (1920/1366/
// 1280) — no controls rendered offscreen, no horizontal overflow. Complements
// menu-hit.cjs (which covers hit-testing at one size).
'use strict';
const { ensureServer, launchBrowser } = require('../_boot.cjs');

const WIDTHS = [1920, 1366, 1280];

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  let fails = 0;
  for (const w of WIDTHS) {
    const { ctx, page } = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${server.base}/word/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#editor', { timeout: 15000 });
      await page.waitForTimeout(1200);
      return { ctx, page };
    })();
    const r = await page.evaluate(() => {
      const ctrls = [...document.querySelectorAll('.ribbon-page button, .ribbon-page input, .ribbon-page select')]
        .filter(el => { const p = el.closest('.ribbon-page'); return p && getComputedStyle(p).display !== 'none'; });
      const off = ctrls.filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; });
      return { ok: off.length === 0 && document.documentElement.scrollWidth <= innerWidth, total: ctrls.length, off: off.length, hScroll: document.documentElement.scrollWidth > innerWidth };
    });
    if (!r.ok) fails++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} width ${w}: ${r.total} controls, offscreen=${r.off}, hScroll=${r.hScroll}`);
    await ctx.close();
  }
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });
