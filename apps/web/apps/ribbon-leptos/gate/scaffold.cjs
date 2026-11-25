// Scaffold smoke test: the app mounts, the stub components render the sample spec, no page errors.
const { chromium } = require('@playwright/test');
const url = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  const count = (sel) => page.locator(sel).count();
  const check = async (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) process.exitCode = 1; };
  await check('10 tabs rendered', (await count('#ribbon-tabs button')) === 10, `${await count('#ribbon-tabs button')}`);
  await check('sample spec: 12 controls', (await count('.btn')) === 12, `${await count('.btn')}`);
  await check('IME bridge present', (await count('#ime-bridge')) === 1);
  await check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
})().catch((e) => { console.error('PROBE CRASHED', e.message); process.exit(1); });
