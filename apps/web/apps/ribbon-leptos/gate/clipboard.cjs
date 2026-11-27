// Clipboard gate: the ribbon ops module owns cut/copy/paste/selectAll/copyStyle/drawSelect.
// Proofs: the FINAL status texts, the REAL browser clipboard content (permissions granted to
// this context), and the document's engine truth through every step (selection text, ink).
// Exit code is the gate result. Page errors are FAILs.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} clipboard: ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready', undefined, { timeout: 30000 });

  const status = () => page.textContent('#status');
  // Wait until #status IS exactly `want` (the promise-backed commands set a pending text first).
  const waitExact = (want, t = 15000) =>
    page.waitForFunction((w) => document.querySelector('#status')?.textContent === w, want, { timeout: t });
  const waitStart = (prefix, t = 15000) =>
    page.waitForFunction((p) => document.querySelector('#status')?.textContent?.startsWith(p), prefix, { timeout: t });
  // Engine truth, from inside the page.
  const selected = () => page.evaluate(() => window.woProbe('selected'));
  const ink = () => page.evaluate(() => Number(window.woProbe('dark')));
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const btn = (id) => page.click(`#${id}`);
  // Ribbon buttons take focus on click; the clipboard commands that do NOT touch the layout
  // (copy) never hand it back. The engine keeps the caret/selection, so refocusing the editor's
  // input without a page click restores the keyboard path (a click would move the caret).
  const refocus = () => page.evaluate(() => document.getElementById('ime-bridge')?.focus());

  // ── 0. does this browser actually grant the async clipboard? Prove it with a probe write,
  //        before any assertion leans on it (headless denial must show, not silently pass). ──
  let clipboardOk = true;
  try {
    await page.evaluate(() => navigator.clipboard.writeText('wo-clipboard-probe'));
    const probe = await page.evaluate(() => navigator.clipboard.readText());
    clipboardOk = probe === 'wo-clipboard-probe';
    check('browser grants the async clipboard (probe round-trip)', clipboardOk, `read back "${probe}"`);
  } catch (e) {
    clipboardOk = false;
    const detail = (e && e.message ? e.message : String(e)).split('\n')[0];
    console.log(`XFAIL clipboard: async clipboard denied in this browser — ${detail}`);
  }

  // ── 1. seed the document: click the page, type. ──
  await page.locator('.page canvas').click({ position: { x: 100, y: 100 } });
  await page.keyboard.type('hello world');
  await waitExact('insert ok');
  check('typed "hello world" (insert ok)', (await status()) === 'insert ok', await status());

  // ── 2. select "world" (End, Shift+ArrowLeft ×5) and copy it through the ribbon. ──
  await page.keyboard.press('End');
  await waitExact('key End ok');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await waitExact('key ArrowLeft ok');
  check('engine selection is "world"', (await selected()) === 'world', JSON.stringify(await selected()));

  await btn('copy');
  if (clipboardOk) {
    await waitExact('copy ok (5 chars)');
    check('copy status is exact', (await status()) === 'copy ok (5 chars)', await status());
    check('browser clipboard holds the selection', (await clip()) === 'world', JSON.stringify(await clip()));
  } else {
    await waitStart('copy failed');
    check('denied clipboard is reported, not faked', (await status()).startsWith('copy failed —'), await status());
  }

  // ── 3. collapse to the end of the line, paste the clipboard back through the engine. ──
  await refocus();
  await page.keyboard.press('End');
  await waitExact('key End ok');
  const inkBeforePaste = await ink();
  await btn('paste');
  await waitStart('paste ok (');
  const pasteStatus = await status();
  check('paste status starts with "paste ok ("', pasteStatus.startsWith('paste ok ('), pasteStatus);
  check('paste collapsed the selection', (await selected()) === '', JSON.stringify(await selected()));
  check('paste really added glyphs (engine ink grew)', (await ink()) > inkBeforePaste,
    `dark ${inkBeforePaste} → ${await ink()}`);

  // ── 4. selectAll: the engine's Ctrl+A via the ribbon command. ──
  await btn('select-all');
  await waitExact('selectAll ok');
  check('selectAll status is exact', (await status()) === 'selectAll ok', await status());
  check('select-all selects the whole text', (await selected()) === 'hello worldworld',
    JSON.stringify(await selected()));

  // ── 5. cut: clipboard write FIRST, then the delete — document empties, clipboard keeps it. ──
  await btn('cut');
  await waitExact('cut ok (16 chars)');
  check('cut status is exact', (await status()) === 'cut ok (16 chars)', await status());
  if (clipboardOk) {
    check('cut clipboard holds the cut text', (await clip()) === 'hello worldworld',
      JSON.stringify(await clip()));
  }
  check('cut emptied the document (no ink left)', (await ink()) === 0, `dark=${await ink()}`);
  check('cut collapsed the selection', (await selected()) === '', JSON.stringify(await selected()));

  // ── 6. select-all on the emptied document: the engine selects nothing. ──
  await btn('select-all');
  await waitExact('selectAll ok');
  const selEmpty = await selected();
  check('select-all on an emptied document selects nothing', selEmpty === '', JSON.stringify(selEmpty));

  // ── 7. copyStyle: an honest Err, not a fake success. ──
  await btn('copy-style');
  await waitExact('copyStyle failed — the engine has no format-painter op');
  check('copyStyle reports the missing op', (await status()) === 'copyStyle failed — the engine has no format-painter op',
    await status());

  // ── 8. copy with nothing selected: an honest no-op Ok. ──
  await btn('copy');
  await waitExact('copy: nothing selected');
  check('copy with nothing selected says so', (await status()) === 'copy: nothing selected', await status());

  // ── 9. refill, select all, then the Draw-tab twin of cut — same COMMAND, other button id. ──
  await btn('paste');
  await waitStart('paste ok (');
  await btn('select-all');
  await waitExact('selectAll ok');
  check('refilled document selected', (await selected()) === 'hello worldworld', JSON.stringify(await selected()));
  await page.evaluate(() => window.woSetEditMode(true));
  await page.click('[role=tab]#tab-draw');
  await page.click('#draw-cut');
  await waitStart('cut ok (');
  check('draw-cut is the same cut command (twin)', (await status()).startsWith('cut ok ('), await status());
  check('draw-cut document emptied again', (await ink()) === 0, `dark=${await ink()}`);

  // ── 10. the document itself stayed intact: an empty page still renders, cleanly. ──
  const pages = await page.locator('.page').count();
  check('the page canvas is still there (document intact)', pages === 1, `pages=${pages}`);
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(failed === 0 ? '\nMODULE OK' : `\nMODULE: ${failed} FAILED`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error('PROBE CRASHED', e && e.message ? e.message : e);
  process.exit(1);
});
