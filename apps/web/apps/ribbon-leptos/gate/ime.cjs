// IME bridge gate: drive REAL composition events through CDP and verify Rust tracks them.
const { chromium } = require('@playwright/test');
const url = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });

  const check = async (name, ok, detail) => { 
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); 
    if (!ok) process.exitCode = 1; 
  };

  // Check #ime-bridge is a textarea and not display:none
  const bridge = page.locator('#ime-bridge');
  await check('IME bridge is a textarea', await bridge.evaluate(el => el.tagName === 'TEXTAREA'));
  const display = await bridge.evaluate(el => window.getComputedStyle(el).display);
  await check('IME bridge not display:none', display !== 'none', `display=${display}`);

  // Check #ime-out exists with empty data-composed and data-committed
  const imeOut = page.locator('#ime-out');
  await check('#ime-out exists', await imeOut.count() === 1);
  await check('initial data-composed is empty', await imeOut.getAttribute('data-composed') === '');
  await check('initial data-committed is empty', await imeOut.getAttribute('data-committed') === '');

  // Create CDP session for REAL IME events
  const cdp = await page.context().newCDPSession(page);
  await page.focus('#ime-bridge');

  // Set composition text
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });
  await page.waitForTimeout(100); // Allow events to propagate

  await check('after imeSetComposition: data-composed ===にほん', 
    await imeOut.getAttribute('data-composed') === 'にほん',
    `got: ${await imeOut.getAttribute('data-composed')}`);

  // Commit the composition
  await cdp.send('Input.insertText', { text: '日本語' });
  await page.waitForTimeout(100);

  await check('after insertText: data-committed ===日本語', 
    await imeOut.getAttribute('data-committed') === '日本語',
    `got: ${await imeOut.getAttribute('data-committed')}`);
  await check('after insertText: data-composed === empty', 
    await imeOut.getAttribute('data-composed') === '',
    `got: ${await imeOut.getAttribute('data-composed')}`);

  // Type a regular key
  await page.keyboard.type('x');
  await page.waitForTimeout(100);

  await check('after typing x: data-committed ===日本語x', 
    await imeOut.getAttribute('data-committed') === '日本語x',
    `got: ${await imeOut.getAttribute('data-committed')}`);

  // Since the canvas editor owns the text, the bridge is drained after every commit: the text
  // lives in the document, the textarea only ferries events (its value would be re-inserted).
  await check('textarea is drained — text lives in the document', 
    await bridge.evaluate(el => el.value) === '',
    `got: ${JSON.stringify(await bridge.evaluate(el => el.value))}`);

  await check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log('IME OK');
})().catch((e) => { console.error('PROBE CRASHED', e.message); process.exit(1); });
