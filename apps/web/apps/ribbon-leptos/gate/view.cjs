// Gate probe for OPS-VIEW: the view ops module — host-side zoom (CSS custom property on .page),
// click mapping under zoom, the 25% clamp, fit-to-width / fit-to-page, the dark document, and the
// honest Errs for what is not rendered. Exit code is the gate result; every check asserts something.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');

  let failed = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} view: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
  };
  const status = () => page.textContent('#status');
  const readout = () => page.textContent('#ops-view .zoom-readout');
  // Click a ribbon control and wait for the status line to answer.
  const clickStatus = async (sel) => {
    const prev = await status();
    await page.click(sel);
    await page.waitForFunction((p) => document.querySelector('#status').textContent !== p, prev);
    return status();
  };
  // Click n times where the status may legitimately repeat (the clamp).
  const clickMany = async (sel, n) => {
    for (let i = 0; i < n; i++) {
      await page.click(sel);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(100);
    return status();
  };
  // getBoundingClientRect through evaluate: a blinking (.off → visibility:hidden) caret still has a box.
  const box = (sel) => page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const rel = (inner, outer) => ({ x: inner.x - outer.x, y: inner.y - outer.y });
  const clickAt = async (x, y) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(100);
    return status();
  };
  const container = () => page.evaluate(() => {
    const c = document.querySelector('.pages');
    return { w: c.clientWidth, h: c.clientHeight };
  });
  const r1 = (v) => Math.round(v * 10) / 10;

  // ── 1. the document: click the page, type ──
  await page.click('[role=tab]#tab-home');
  await page.locator('.page').first().click();
  await page.keyboard.type('zoom me');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'insert ok');
  check('typed text reaches the document', (await status()) === 'insert ok', await status());

  // ── 2. View tab: the 100% geometry ──
  await page.click('[role=tab]#tab-view');
  await page.waitForTimeout(100);
  const page1 = await box('.page');
  check('page is the engine A4 at 100%', page1.width === 793 && page1.height === 1123, `${r1(page1.width)}×${r1(page1.height)}`);
  check('zoom starts at 100%', (await readout()) === '100%', await readout());
  check('the canvas bitmap is 793×1123 before zooming', await page.evaluate(() => { const c = document.querySelector('.page canvas'); return c.width === 793 && c.height === 1123; }));
  if ((await page.locator('.page .caret').count()) === 0) await clickAt(page1.x + 100, page1.y + 100);
  const caret1 = await box('.page .caret');

  // ── 3. zoom in twice → 120%: the page AND the caret (inside .page) scale ──
  const s1 = await clickStatus('#zoom-in');
  const s2 = await clickStatus('#zoom-in');
  check('zoom-in twice reports zoom 120%', s1 === 'zoom 110%' && s2 === 'zoom 120%', `${s1} → ${s2}`);
  const page2 = await box('.page');
  const caret2 = await box('.page .caret');
  check('page scales with the zoom (120%)', page2.width >= page1.width * 1.19, `${r1(page1.width)} → ${r1(page2.width)} px`);
  check('caret scales with the zoom (120%)', caret2.height >= caret1.height * 1.19, `${r1(caret1.height)} → ${r1(caret2.height)} px`);
  check('the readout follows the zoom', (await readout()) === '120%', await readout());
  check('zoom is host-side: the canvas bitmap is unchanged', await page.evaluate(() => { const c = document.querySelector('.page canvas'); return c.width === 793 && c.height === 1123 && getComputedStyle(document.documentElement).getPropertyValue('--wo-zoom').trim() === '1.2'; }));
  // the caret is still on the text: same DOCUMENT point, scaled by 1.2
  const c1 = rel(caret1, page1); const c2 = rel(caret2, page2);
  check('caret stays on the same document point (1.2× page-relative)', Math.abs(c2.x - c1.x * 1.2) <= 3 && Math.abs(c2.y - c1.y * 1.2) <= 3, `(${r1(c1.x)}, ${r1(c1.y)}) → (${r1(c2.x)}, ${r1(c2.y)})`);

  // ── 4. click mapping at 200% ──
  check('zoom-100 reports zoom 100%', (await clickStatus('#zoom-100')) === 'zoom 100%', await status());
  const p100 = await box('.page');
  check('zoom 100% restores the page width', Math.abs(p100.width - page1.width) <= 1, `${r1(p100.width)} vs ${r1(page1.width)} px`);
  const st100 = await clickAt(p100.x + 100, p100.y + 110);
  const a = rel(await box('.page .caret'), p100);
  let s = await status();
  for (let n = 0; n < 15 && s !== 'zoom 200%'; n++) s = await clickStatus('#zoom-in');
  check('zoom-in x10 reaches zoom 200%', s === 'zoom 200%', s);
  const p200 = await box('.page');
  check('page is twice as wide at 200%', p200.width >= page1.width * 1.99, `${r1(p200.width)} px`);
  const st200 = await clickAt(p200.x + 200, p200.y + 220);
  const b = rel(await box('.page .caret'), p200);
  check('both clicks hit the text', st100.startsWith('click ok') && st200.startsWith('click ok'), `${st100} | ${st200}`);
  check('click at 200% maps to the same document point (2× page-relative, ±3 px)',
    Math.abs(b.x - a.x * 2) <= 3 && Math.abs(b.y - a.y * 2) <= 3,
    `100%: (${r1(a.x)}, ${r1(a.y)}) → 200%: (${r1(b.x)}, ${r1(b.y)})`);

  // ── 5. zoom out x10 → 100% (page width back within 1 px); x10 more → the 25% clamp ──
  const sOut = await clickMany('#zoom-out', 10);
  const pBack = await box('.page');
  check('zoom-out x10 from 200% is zoom 100%', sOut === 'zoom 100%', sOut);
  check('page width back within 1 px of the 100% width', Math.abs(pBack.width - page1.width) <= 1, `${r1(pBack.width)} vs ${r1(page1.width)} px`);
  const sClamp = await clickMany('#zoom-out', 10);
  check('zoom-out x10 more clamps at zoom 25%', sClamp === 'zoom 25%', sClamp);
  const sClamp2 = await clickMany('#zoom-out', 3);
  check('zoom-out past the clamp stays at zoom 25%', sClamp2 === 'zoom 25%', sClamp2);
  const p25 = await box('.page');
  check('page is a quarter wide at 25%', Math.abs(p25.width - page1.width * 0.25) <= 1, `${r1(p25.width)} px`);

  // ── 6. fit to width: fills the .pages container minus 48 px ──
  // fit-to-width / fit-to-page / multiple-pages live in the HOME tab's "view" group, not the View tab
  await page.click('[role=tab]#tab-home');
  await page.waitForTimeout(100);
  const sFit = await clickStatus('#fit-to-width');
  check('fit-to-width status', /^zoom \d+% \(fit to width\)$/.test(sFit), sFit);
  const cw = (await container()).w;
  const pFit = await box('.page');
  check('fit-to-width fills the container minus 48 px (±8)', Math.abs(pFit.width - (cw - 48)) <= 8, `page ${r1(pFit.width)} px vs container ${cw} − 48 = ${cw - 48}`);
  check('fit-to-width zoomed in (page wider than at 100%)', pFit.width > page1.width * 1.5, `${r1(pFit.width)} vs ${r1(page1.width)} px`);
  check('fit-to-width leaves no horizontal overflow', await page.evaluate(() => { const c = document.querySelector('.pages'); return c.scrollWidth <= c.clientWidth; }));

  // ── 7. fit to page: the height limits too ──
  const sFP = await clickStatus('#fit-to-page');
  check('fit-to-page status', /^zoom \d+% \(fit to page\)$/.test(sFP), sFP);
  const c2m = await container();
  const pFP = await box('.page');
  check('fit-to-page fits the container height minus 48 px (±12 = 1%)', Math.abs(pFP.height - (c2m.h - 48)) <= 12 && pFP.width < cw - 48, `page ${r1(pFP.width)}×${r1(pFP.height)} px vs container ${c2m.w}×${c2m.h}`);
  await page.click('[role=tab]#tab-view');
  await page.waitForTimeout(100);
  check('zoom-100 back to 100%', (await clickStatus('#zoom-100')) === 'zoom 100%', await status());

  // ── 8. dark document: body class + CSS filter; the canvas bitmap is identical ──
  const darkBefore = await page.evaluate(() => window.woProbe('dark'));
  await page.click('#dark-document');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'dark document on');
  const on = await page.evaluate(() => ({
    pressed: document.querySelector('#dark-document').getAttribute('aria-pressed'),
    cls: document.body.classList.contains('dark-document'),
    filter: getComputedStyle(document.querySelector('.page canvas')).filter,
    bg: getComputedStyle(document.querySelector('.pages')).backgroundColor,
    dark: window.woProbe('dark'),
  }));
  check('dark document on: status', (await status()) === 'dark document on', await status());
  check('dark document on: checkbox pressed', on.pressed === 'true', on.pressed);
  check('dark document on: body has the class', on.cls === true);
  check('dark document on: canvas filtered', on.filter.includes('invert'), on.filter);
  check('dark document on: container is dark', on.bg === 'rgb(27, 27, 31)', on.bg);
  check('dark document on: canvas bitmap unchanged', JSON.stringify(on.dark) === JSON.stringify(darkBefore), `${darkBefore} → ${on.dark}`);
  await page.click('#dark-document');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'dark document off');
  const off = await page.evaluate(() => ({
    pressed: document.querySelector('#dark-document').getAttribute('aria-pressed'),
    cls: document.body.classList.contains('dark-document'),
    filter: getComputedStyle(document.querySelector('.page canvas')).filter,
  }));
  check('dark document off: status', (await status()) === 'dark document off', await status());
  check('dark document off: checkbox released, class gone, no filter', off.pressed === 'false' && off.cls === false && off.filter === 'none', JSON.stringify(off));

  // ── 9. honest Errs for what is not rendered ──
  check('ruler', (await clickStatus('#ruler')) === 'toggleRuler failed — the ruler is not rendered yet', await status());
  check('gridlines', (await clickStatus('#gridlines')) === 'toggleGridlines failed — gridlines are not rendered yet', await status());
  check('navigation', (await clickStatus('#navigation')) === 'toggleNavigation failed — the navigation pane is not rendered yet', await status());
  check('macros', (await clickStatus('#macros')) === 'macros failed — macros are not available in the editor', await status());
  check('record-macro', (await clickStatus('#record-macro')) === 'recordMacro failed — macros are not available in the editor', await status());
  await page.click('[role=tab]#tab-home');
  await page.waitForTimeout(100);
  check('multiple-pages', (await clickStatus('#multiple-pages')) === 'multiplePages failed — pages are shown in one column — no multi-page grid yet', await status());
  await page.click('[role=tab]#tab-view');
  await page.waitForTimeout(100);
  await page.selectOption('#interface-theme', 'dark');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('interface-theme'));
  check('interface theme', (await status()) === 'interface-theme failed — interface themes are not available yet', await status());

  // ── 10. one zoom state across tabs: Home zoom-in sees 110%, Draw zoom-out back to 100% ──
  await page.click('[role=tab]#tab-home');
  await page.waitForTimeout(100);
  check('Home zoom-in shares the zoom state', (await clickStatus('#zoom-in')) === 'zoom 110%', await status());
  await page.evaluate(() => window.woSetEditMode(true));
  await page.click('[role=tab]#tab-draw');
  await page.waitForTimeout(100);
  check('Draw zoom-out shares the zoom state', (await clickStatus('#draw-zoom-out')) === 'zoom 100%', await status());
  check('draw-multiple-pages honest', (await clickStatus('#draw-multiple-pages')) === 'toggleMultiplePages failed — pages are shown in one column — no multi-page grid yet', await status());
  check('Draw fit-to-width shares the state', /^zoom \d+% \(fit to width\)$/.test(await clickStatus('#draw-fit-to-width')), await status());

  // ── 11. no page errors ──
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log(failed ? `MODULE: ${failed} FAILED` : 'MODULE OK');
  process.exitCode = failed ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.log(`FAIL view: probe crashed — ${e.message}`);
  process.exitCode = 1;
});
