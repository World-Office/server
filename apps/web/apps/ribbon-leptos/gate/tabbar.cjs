// TabBar gate: WAI-ARIA tablist pattern
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
  const get = async (sel, prop) => page.locator(sel).first().getAttribute(prop);
  const check = async (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) process.exitCode = 1; };

  // 10 tabs with correct labels
  const tabs = page.locator('#ribbon-tabs [role=tab]');
  await check('10 tabs with role=tab', (await count('#ribbon-tabs [role=tab]')) === 10, `${await count('#ribbon-tabs [role=tab]')}`);
  const expectedLabels = ['Home', 'Insert', 'Draw', 'Layout', 'References', 'Collaboration', 'Protection', 'View', 'Plugins', 'AI'];
  for (let i = 0; i < 10; i++) {
    const label = await tabs.nth(i).textContent();
    await check(`tab ${i} label is ${expectedLabels[i]}`, label === expectedLabels[i], `${label}`);
  }

  // tablist role
  await check('tablist role', (await page.locator('#ribbon-tabs').getAttribute('role')) === 'tablist', await page.locator('#ribbon-tabs').getAttribute('role'));

  // Initially Home is selected
  await check('exactly one aria-selected=true (Home)', (await tabs.filter({ hasText: 'Home' }).getAttribute('aria-selected')) === 'true');
  await check('Home has active class', (await tabs.filter({ hasText: 'Home' }).getAttribute('class')).includes('active'));
  await check('Home has tabindex=0', (await tabs.filter({ hasText: 'Home' }).getAttribute('tabindex')) === '0');
  
  // Other tabs are not selected, tabindex=-1, no active class
  for (const label of expectedLabels.slice(1)) {
    const tab = tabs.filter({ hasText: label });
    const sel = await tab.getAttribute('aria-selected');
    const idx = await tab.getAttribute('tabindex');
    const cls = await tab.getAttribute('class');
    await check(`${label} aria-selected=false`, sel === 'false', sel);
    await check(`${label} tabindex=-1`, idx === '-1', idx);
    await check(`${label} no active class`, !cls?.includes('active'), cls);
  }

  // Click Insert tab
  await tabs.filter({ hasText: 'Insert' }).click();
  await check('after click Insert: Insert aria-selected=true', (await tabs.filter({ hasText: 'Insert' }).getAttribute('aria-selected')) === 'true');
  await check('after click Insert: Insert has active class', (await tabs.filter({ hasText: 'Insert' }).getAttribute('class')).includes('active'));
  await check('after click Insert: Insert tabindex=0', (await tabs.filter({ hasText: 'Insert' }).getAttribute('tabindex')) === '0');
  await check('after click Insert: Home aria-selected=false', (await tabs.filter({ hasText: 'Home' }).getAttribute('aria-selected')) === 'false');
  await check('after click Insert: Home tabindex=-1', (await tabs.filter({ hasText: 'Home' }).getAttribute('tabindex')) === '-1');
  
  // Check tabpanel has correct data-tab
  await check('tabpanel has data-tab=insert', (await page.locator('.panel[role=tabpanel]').getAttribute('data-tab')) === 'insert');

  // Focus Insert tab and test arrow navigation
  await page.focus('#tab-insert');
  await page.keyboard.press('ArrowRight');
  await check('ArrowRight from Insert: Draw selected', (await tabs.filter({ hasText: 'Draw' }).getAttribute('aria-selected')) === 'true');
  await check('ArrowRight from Insert: Draw has focus', (await page.evaluate(() => document.activeElement.id)) === 'tab-draw');

  // Test End key
  await page.keyboard.press('End');
  await check('End: AI selected', (await tabs.filter({ hasText: 'AI' }).getAttribute('aria-selected')) === 'true');
  await check('End: AI has focus', (await page.evaluate(() => document.activeElement.id)) === 'tab-ai');

  // Test Home key
  await page.keyboard.press('Home');
  await check('Home: Home selected', (await tabs.filter({ hasText: 'Home' }).getAttribute('aria-selected')) === 'true');
  await check('Home: Home has focus', (await page.evaluate(() => document.activeElement.id)) === 'tab-home');

  // Test ArrowLeft from Home (should wrap to AI)
  await page.keyboard.press('ArrowLeft');
  await check('ArrowLeft from Home: AI selected', (await tabs.filter({ hasText: 'AI' }).getAttribute('aria-selected')) === 'true');
  await check('ArrowLeft from Home: AI has focus', (await page.evaluate(() => document.activeElement.id)) === 'tab-ai');

  // Test ArrowRight from AI (should wrap to Home)
  await page.keyboard.press('ArrowRight');
  await check('ArrowRight from AI: Home selected', (await tabs.filter({ hasText: 'Home' }).getAttribute('aria-selected')) === 'true');
  await check('ArrowRight from AI: Home has focus', (await page.evaluate(() => document.activeElement.id)) === 'tab-home');

  // After all steps, exactly one aria-selected=true
  const selectedCount = await page.locator('#ribbon-tabs [role=tab][aria-selected=true]').count();
  await check('exactly one tab selected at end', selectedCount === 1, `${selectedCount}`);

  // No page errors
  await check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('TABBAR OK');
})().catch((e) => { console.error('PROBE CRASHED', e.message); process.exit(1); });
