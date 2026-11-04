// surfaces/tab-switch-widths.cjs — L4 surface probe.
// Guards contract area: ribbon integrity across viewport widths (1920/1366/
// 1280) — no page-level horizontal scroll, and when the band overflows the
// chevron scroll must bring the furthest control fully into view.
// Complements menu-hit.cjs (which covers hit-testing at one size).
//
// 2026-11-04: the old assertion "no control rect beyond innerWidth" was
// wrong twice over: (a) .gallery-track is overflow:hidden BY DESIGN (the
// styles dropdown keeps clipped cards reachable — see .rb-styles comment in
// style.css), so its cards' rects legitimately extend past the viewport;
// (b) other controls past the viewport are reachable via the band chevrons,
// which is the documented overflow mechanism. What must actually hold:
// no DOCUMENT h-scroll + chevron-reachability of every non-clipped control.
'use strict';
const { ensureServer, launchBrowser } = require('../_boot.cjs');

const WIDTHS = [1920, 1366, 1280];

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  let fails = 0;
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${server.base}/word/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#editor', { timeout: 15000 });
    await page.waitForTimeout(1200);
    // step 1: layout health at load
    const lay = await page.evaluate(() => {
      const hScroll = document.documentElement.scrollWidth > innerWidth;
      // non-clipped controls: skip .gallery-track internals (overflow:hidden
      // by design; the styles dropdown covers their reachability)
      const ctrls = [...document.querySelectorAll('.ribbon-page button, .ribbon-page input, .ribbon-page select')]
        .filter(el => {
          const pg = el.closest('.ribbon-page');
          if (!pg || getComputedStyle(pg).display === 'none') return false;
          return !el.closest('.gallery-track');
        });
      let furthest = null, fr = 0;
      for (const el of ctrls) { const r = el.getBoundingClientRect(); if (r.right > fr) { fr = r.right; furthest = el; } }
      const sr = document.querySelector('#rib-scroll-right');
      return { hScroll, total: ctrls.length, furthestRight: Math.round(fr),
        furthestSel: furthest ? (furthest.id ? '#' + furthest.id : '.' + (furthest.className || '').toString().split(' ')[0]) : null,
        chevronVisible: sr ? !sr.hidden && getComputedStyle(sr).display !== 'none' : false };
    });
    let ok = !lay.hScroll;
    let why = `${lay.total} controls, hScroll=${lay.hScroll}`;
    // step 2: if the band overflows, the chevron must exist and reach
    if (lay.furthestRight > w) {
      if (!lay.chevronVisible) { ok = false; why += `, overflow ${lay.furthestRight - w}px but chevron hidden`; }
      else {
        for (let i = 0; i < 6; i++) {
          const gone = await page.evaluate(() => { const s = document.querySelector('#rib-scroll-right'); return !s || s.hidden; });
          if (gone) break;
          await page.click('#rib-scroll-right');
          await page.waitForTimeout(120);
        }
        const r = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { vis: false, hit: false };
          const b = el.getBoundingClientRect();
          const vis = b.right <= innerWidth + 1;
          const mid = document.elementFromPoint(Math.min(b.x + b.width / 2, innerWidth - 3), b.y + b.height / 2);
          return { vis, hit: !!mid && !!mid.closest('.ribbon-page') };
        }, lay.furthestSel);
        if (!r.vis || !r.hit) { ok = false; why += `, chevron scroll left ${lay.furthestSel} at ${lay.furthestRight}px unreachable (vis=${r.vis} hit=${r.hit})`; }
        else why += `, overflow reached via chevron (${lay.furthestSel})`;
      }
    } else {
      why += `, fits (furthest ${lay.furthestRight}px)`;
    }
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} width ${w}: ${why}`);
    await ctx.close();
  }
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });
