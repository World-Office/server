// Gate probe for ribbon/ops find & replace (`find`, `replace` — Home > Editing).
// Proves: the bar opens on #find / #replace; typing counts REAL matches over the whole document
// (read through the selection trick — the document must stay byte-identical, the caret back at
// its pixel); case-sensitive vs insensitive; Escape closes; Replace reports the honest Err and
// never rewrites the text. Exit code is the gate result; page errors are FAILs.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

// The measured document text and its truth (host test `selection_trick_...` pins the same):
// "the cat and the hat" contains `the` twice, `The` zero times — the task prose said 3, the
// engine says 2; the gate asserts the engine's number (verdict protocol: measured numbers only).
const DOC = 'the cat and the hat';
const N = 2;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  };
  const status = () => page.textContent('#status');
  const results = () => page.textContent('#find-results');
  const waitStatus = (prev) =>
    page.waitForFunction(
      (p) => document.querySelector('#status')?.textContent !== p,
      prev,
      { timeout: 8000 },
    );
  const waitResults = (text) =>
    page.waitForFunction(
      (t) => document.querySelector('#find-results')?.textContent === t,
      text,
      { timeout: 8000 },
    );
  const selected = () => page.evaluate(() => window.woProbe('selected'));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready', null, { timeout: 30000 });
  await page.click('[role=tab]#tab-home');

  // ── 1. a document with text: click the first line, type ──────────────────────────────────
  await page.locator('.page canvas').first().click({ position: { x: 100, y: 100 } });
  let prev = await status();
  await page.keyboard.type(DOC);
  await waitStatus(prev);
  check('typed text reaches the document', (await status()) === 'insert ok', await status());

  const caretBefore = await page.locator('.caret').boundingBox();
  check('caret is drawn after typing', !!caretBefore, JSON.stringify(caretBefore));

  // ── 2. #find opens the bar ────────────────────────────────────────────────────────────────
  prev = await status();
  await page.click('#find');
  await waitStatus(prev);
  check('find opens the bar', (await status()) === 'find: type a term', await status());
  const findWhat = page.locator('#find-what');
  check('#find-what is visible', (await findWhat.count()) === 1 && (await findWhat.isVisible()));

  // ── 3. typing counts REAL matches: 'the' over the whole document ──────────────────────────
  await findWhat.fill('the');
  await waitResults(`${N} matches — jumping needs an engine text-offset op`);
  check(
    `results line counts ${N} matches`,
    (await results()) === `${N} matches — jumping needs an engine text-offset op`,
    await results(),
  );
  check('status says find ok (2 matches)', (await status()) === `find ok (${N} matches)`, await status());

  // The typed term went into the INPUT, not the document: select all and read the engine.
  prev = await status();
  await page.click('#select-all');
  await waitStatus(prev);
  check('select-all runs', (await status()) === 'selectAll ok', await status());
  check(
    'the document is byte-identical after counting',
    (await selected()) === DOC,
    JSON.stringify(await selected()),
  );
  check('still exactly one page', (await page.locator('.page').count()) === 1);

  // ── 4. case-insensitive by default: 'The' matches too (none in this document → no matches) ─
  await findWhat.fill('The');
  await waitResults('no matches');
  check("case-insensitive 'The' finds nothing here", (await results()) === 'no matches', await results());
  check('status says find ok (no matches)', (await status()) === 'find ok (no matches)', await status());

  // ── 5. the case checkbox re-counts: tick it, 'The' still 0, 'the' exactly N ────────────────
  await page.check('#find-case');
  await waitResults('no matches');
  check('ticking case re-counts the current term', (await results()) === 'no matches', await results());
  await findWhat.fill('the');
  await waitResults(`${N} matches — jumping needs an engine text-offset op`);
  check(
    "case-sensitive 'the' counts the lowercase ones",
    (await results()) === `${N} matches — jumping needs an engine text-offset op`,
    await results(),
  );
  await findWhat.fill('The');
  await waitResults('no matches');
  check(
    "case-sensitive 'The' finds nothing",
    (await results()) === 'no matches' && (await status()) === 'find ok (no matches)',
    `${await results()} / ${await status()}`,
  );

  // ── 6. the caret is back where it was (bar open must not shift the pages either) ──────────
  const caretAfter = await page.locator('.caret').boundingBox();
  const dx = caretAfter && caretBefore ? Math.abs(caretAfter.x - caretBefore.x) : Infinity;
  const dy = caretAfter && caretBefore ? Math.abs(caretAfter.y - caretBefore.y) : Infinity;
  check(
    'caret back within 1 px after the last search',
    dx <= 1 && dy <= 1,
    `dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} (before ${JSON.stringify(caretBefore)}, after ${JSON.stringify(caretAfter)})`,
  );

  // ── 7. Escape closes the bar ───────────────────────────────────────────────────────────────
  await page.focus('#find-what');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('.find-bar')?.classList.contains('open'),
    null,
    { timeout: 8000 },
  );
  check('Escape hides the bar', !(await findWhat.isVisible()));

  // ── 8. replace: honest Err, document untouched ─────────────────────────────────────────────
  prev = await status();
  await page.click('#replace');
  await waitStatus(prev);
  check('replace opens the bar', (await status()) === 'replace: type the terms', await status());
  const replaceWith = page.locator('#replace-with');
  check(
    '#replace-with is visible',
    (await replaceWith.count()) === 1 && (await replaceWith.isVisible()),
  );
  await page.click('#replace-go');
  await page.waitForFunction(
    () => document.querySelector('#find-results')?.textContent === 'replace: the engine has no text-offset replace op',
    null,
    { timeout: 8000 },
  );
  check(
    'results line reports the honest gap',
    (await results()) === 'replace: the engine has no text-offset replace op',
    await results(),
  );
  check(
    'status reports replace failed — no text-offset replace op',
    (await status()) === 'replace failed — the engine has no text-offset replace op',
    await status(),
  );
  prev = await status();
  await page.click('#select-all');
  await waitStatus(prev);
  check(
    'replace never rewrote the document',
    (await selected()) === DOC,
    JSON.stringify(await selected()),
  );

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log(failed === 0 ? 'MODULE OK' : `MODULE: ${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
  await browser.close();
})().catch((e) => {
  console.log(`FAIL gate crashed — ${e.message}`);
  console.log('MODULE: 1 FAILED');
  process.exitCode = 1;
});
