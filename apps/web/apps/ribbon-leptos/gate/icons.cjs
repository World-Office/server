// Gate probe for OPS-ICONS: every ribbon control renders a real Lucide SVG (not the icon name
// text) inside its .icon span. Runs after `node tools/gen-lucide-icons.mjs --check` so a stale
// generated file fails first. Exit code is the gate result.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

const SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} icons: ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready', null, { timeout: 30000 });

  // Insert/Draw/Chart-Design tabs only exist in edit mode.
  await page.evaluate(() => window.woSetEditMode(true));
  await page.waitForFunction(() => document.querySelectorAll('#ribbon-tabs .tab').length === 11, null, { timeout: 5000 });

  // Per-tab census: every [data-icon] in the active panel has exactly one <svg> with >= 1 shape,
  // no leftover icon-name text, and no data-icon-missing marker.
  const tabIds = await page.$$eval('#ribbon-tabs .tab', (els) => els.map((e) => e.id));
  check('11 tabs rendered in edit mode', tabIds.length === 11, `${tabIds.length} tabs: ${tabIds.join(',')}`);

  let total = 0;
  const perTab = {};
  for (const id of tabIds) {
    await page.click(`#${id}`);
    // Wait for the panel to switch to this tab's controls.
    await page.waitForFunction((tid) => document.querySelector('section.panel')?.getAttribute('data-tab') === tid.replace('tab-', ''), id, { timeout: 5000 });
    const census = await page.evaluate((shapes) => {
      const panel = document.querySelector('section.panel');
      if (!panel) return { count: 0, bad: ['no panel'], icons: [] };
      const spans = [...panel.querySelectorAll('[data-icon]')];
      const bad = [];
      for (const s of spans) {
        const name = s.getAttribute('data-icon');
        const svgs = s.querySelectorAll('svg');
        if (svgs.length !== 1) { bad.push(`${name}: ${svgs.length} svg`); continue; }
        const svg = svgs[0];
        if (!svg.querySelector(shapes)) bad.push(`${name}: no shape`);
        if ((s.textContent || '').trim() !== '') bad.push(`${name}: text "${s.textContent.trim()}"`);
        if (s.hasAttribute('data-icon-missing')) bad.push(`${name}: data-icon-missing`);
      }
      return { count: spans.length, bad, icons: spans.map((s) => s.getAttribute('data-icon')) };
    }, SHAPES);
    total += census.count;
    perTab[id] = census.count;
    check(`${id}: every [data-icon] has one <svg> with shapes, no text, no missing`,
      census.bad.length === 0, census.bad.length ? census.bad.join('; ') : `${census.count} icons`);
  }
  console.log(`icons: per-tab counts ${JSON.stringify(perTab)}`);
  check('total [data-icon] across all tabs >= 100', total >= 100, `total=${total}`);

  // ── geometry: 24×24 button boxes preserved, 16×16 svg inside ──
  await page.click('#tab-home');
  await page.waitForFunction(() => document.querySelector('section.panel')?.getAttribute('data-tab') === 'home', null, { timeout: 5000 });

  const cutBox = await page.locator('#cut').boundingBox();
  check('#cut button is 24×24 (±1)', Math.abs(cutBox.width - 24) <= 1 && Math.abs(cutBox.height - 24) <= 1,
    `${cutBox.width}×${cutBox.height}`);

  const clipBtns = page.locator('.group[data-group="clipboard"] button');
  const clipCount = await clipBtns.count();
  let clipSquare = true;
  const clipDetail = [];
  for (let i = 0; i < clipCount; i++) {
    const b = await clipBtns.nth(i).boundingBox();
    if (Math.abs(b.width - 24) > 1 || Math.abs(b.height - 24) > 1) { clipSquare = false; clipDetail.push(`${b.width}×${b.height}`); }
  }
  check('every clipboard group button is 24×24 (±1)', clipSquare, `${clipCount} buttons: ${clipDetail.join(',') || 'ok'}`);

  const cutSvgBox = await page.locator('#cut svg').boundingBox();
  check('#cut svg is 16×16 (±1)', Math.abs(cutSvgBox.width - 16) <= 1 && Math.abs(cutSvgBox.height - 16) <= 1,
    `${cutSvgBox.width}×${cutSvgBox.height}`);

  // #cut is Scissors (two circles + paths); #bold is a single path.
  const cutHasCircle = await page.locator('#cut svg').evaluate((svg) => !!svg.querySelector('circle'));
  const boldHasPath = await page.locator('#bold svg').evaluate((svg) => !!svg.querySelector('path'));
  check('#cut svg contains a circle (Scissors)', cutHasCircle);
  check('#bold svg contains a path (Bold)', boldHasPath);

  // ── Insert tab: the dropdown #insert-content-control carries an svg too ──
  await page.click('#tab-insert');
  await page.waitForFunction(() => document.querySelector('section.panel')?.getAttribute('data-tab') === 'insert', null, { timeout: 5000 });
  const ddSvg = await page.locator('#insert-content-control svg').count();
  check('Insert #insert-content-control (dropdown) has an svg', ddSvg === 1, `${ddSvg} svg`);
  const ddHasShape = ddSvg === 1 ? await page.locator('#insert-content-control svg').evaluate((svg) => !!svg.querySelector('path, rect, circle, ellipse, line, polyline, polygon')) : false;
  check('Insert #insert-content-control svg has a shape', ddHasShape);

  // ── no page errors ──
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  if (failed === 0) console.log('\nMODULE OK');
  else console.log(`\nMODULE: ${failed} FAILED`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error('PROBE CRASHED', e.message); process.exit(1); });
