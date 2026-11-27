// Gate probe for paragraph ops: line-spacing select → line pitch grows ≥2.5×,
// honest Errs for multilevelList, changeCase, text-direction, toggleNonprinting, shading, borders.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });

  const status = async () => page.textContent('#status');

  const check = async (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} paragraph: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) process.exitCode = 1;
  };

  // Ensure we're in edit mode and on the Home tab
  await page.evaluate(() => window.woSetEditMode(true));
  await page.click('[role=tab]#tab-home');
  await page.waitForTimeout(100);

  // Wait for ready status
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');

  // Click on the page and type 'alpha'
  await page.locator('.page').first().click();
  await page.keyboard.type('alpha');
  await page.waitForTimeout(150);
  await check('typed alpha', (await status()) === 'insert ok', await status());

  // Press Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await check('pressed Enter', (await status()).startsWith('key Enter ok'), await status());

  // Type 'beta'
  await page.keyboard.type('beta');
  await page.waitForTimeout(150);
  await check('typed beta', (await status()) === 'insert ok', await status());

  // We're now at the end of the second line ("beta").
  // Navigate up to the first line
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  await check('ArrowUp moved to first line', (await status()).startsWith('key'), await status());

  // Get caret position on first line
  await page.waitForSelector('.caret');
  let caretBox1 = await page.locator('.caret').boundingBox();
  await check('caret on first line after ArrowUp', caretBox1 !== null);
  const y1 = caretBox1.y;

  // Navigate down to the second line
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  await check('ArrowDown moved to second line', (await status()).startsWith('key'), await status());

  // Get caret position on second line
  let caretBox2 = await page.locator('.caret').boundingBox();
  await check('caret on second line after ArrowDown', caretBox2 !== null);
  const y2 = caretBox2.y;

  // Calculate pitch (vertical distance between the two carets)
  let pitchDefault = Math.abs(y2 - y1);
  console.log(`pitch at default: ${pitchDefault}px`);

  // Set line-spacing to 1 explicitly and measure again
  await page.selectOption('#line-spacing', '1');
  await page.waitForTimeout(200);
  let s = await status();
  await check('line-spacing 1 status', s === 'line-spacing ok (1)', s);

  // Navigate up and down again to get new positions
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  let caretBox1b = await page.locator('.caret').boundingBox();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  let caretBox2b = await page.locator('.caret').boundingBox();
  let pitch1 = Math.abs(caretBox2b.y - caretBox1b.y);
  console.log(`pitch at line-spacing=1: ${pitch1}px`);

  // Set line-spacing to 3
  await page.selectOption('#line-spacing', '3');
  await page.waitForTimeout(200);
  s = await status();
  await check('line-spacing 3 status', s === 'line-spacing ok (3)', s);

  // Re-measure pitch
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  let caretBox1c = await page.locator('.caret').boundingBox();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  let caretBox2c = await page.locator('.caret').boundingBox();
  let pitch3 = Math.abs(caretBox2c.y - caretBox1c.y);
  console.log(`pitch at line-spacing=3: ${pitch3}px`);

  // The line pitch must grow ≥ 2.5× from factor 1 to 3
  const ratio = pitch3 / pitch1;
  await check(
    'pitch grows >=2.5x from factor 1 to 3',
    ratio >= 2.5,
    `ratio=${ratio.toFixed(2)}, pitch1=${pitch1}px, pitch3=${pitch3}px`
  );

  // Set back to 1 and verify pitch returns to approximately the same value
  await page.selectOption('#line-spacing', '1');
  await page.waitForTimeout(200);
  s = await status();
  await check('line-spacing back to 1 status', s === 'line-spacing ok (1)', s);

  // Re-measure
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  let caretBox1d = await page.locator('.caret').boundingBox();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  let caretBox2d = await page.locator('.caret').boundingBox();
  let pitch1_again = Math.abs(caretBox2d.y - caretBox1d.y);
  console.log(`pitch at line-spacing=1 (again): ${pitch1_again}px`);

  await check(
    'pitch returns to original when back to 1',
    Math.abs(pitch1_again - pitch1) <= 2,
    `diff=${Math.abs(pitch1_again - pitch1).toFixed(1)}px (${pitch1}px -> ${pitch1_again}px)`
  );

  // Test multilevelList
  await page.click('#multilevel-list');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'multilevelList honest Err',
    s === 'multilevelList failed — the engine has no list-level op',
    s
  );

  // Test changeCase
  await page.click('#change-case');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'changeCase honest Err',
    s === 'changeCase failed — the engine has no case-change op',
    s
  );

  // Test text-direction
  await page.selectOption('#text-direction', 'rtl');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'text-direction honest Err',
    s === 'text-direction failed — the engine has no text-direction op',
    s
  );

  // Reset text-direction to empty
  await page.selectOption('#text-direction', '');
  await page.waitForTimeout(150);

  // Test toggleNonprinting
  await page.click('#nonprinting');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'toggleNonprinting honest Err',
    s === 'toggleNonprinting failed — formatting marks are not rendered yet',
    s
  );

  // Test shading
  await page.click('#shading');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'shading honest Err',
    s === 'shading failed — the engine has no shading op',
    s
  );

  // Test borders
  await page.click('#borders');
  await page.waitForTimeout(150);
  s = await status();
  await check(
    'borders honest Err',
    s === 'borders failed — the engine has no borders op',
    s
  );

  // No page errors
  await check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();

  if (process.exitCode === 1) {
    console.log('\nPARAGRAPH MODULE: SOME CHECKS FAILED');
  } else {
    console.log('\nPARAGRAPH MODULE: ALL CHECKS PASSED');
  }
})().catch((e) => {
  console.error('PROBE CRASHED:', e.message || e);
  process.exit(1);
});
