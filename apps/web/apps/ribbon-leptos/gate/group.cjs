// Gate probe for L1-04: RibbonGroup + control kinds
// Tests: two-row group structure, button/select/color-picker rendering, toggle behavior
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
  const text = (sel) => page.locator(sel).textContent();
  const get_attr = (sel, attr) => page.locator(sel).getAttribute(attr);
  const bounding_box = (sel) => page.locator(sel).boundingBox();

  const check = async (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) process.exitCode = 1;
  };

  // (1) Font group structure
  await check('font group exists', (await count('.group[data-group="font"]')) === 1);
  
  // Check row-top contains large controls
  const fontGroup = page.locator('.group[data-group="font"]');
  const rowTop = fontGroup.locator('.elset > .row-top');
  await check('font group has row-top', (await rowTop.count()) === 1);
  
  const rowBottom = fontGroup.locator('.elset > .row-bottom');
  await check('font group has row-bottom', (await rowBottom.count()) === 1);

  // row-top should have font-family, font-size, increase-font-size, decrease-font-size
  await check('row-top has font-family', (await rowTop.locator('#font-family').count()) === 1);
  await check('row-top has font-size', (await rowTop.locator('#font-size').count()) === 1);
  await check('row-top has increase-font-size', (await rowTop.locator('#increase-font-size').count()) === 1);
  await check('row-top has decrease-font-size', (await rowTop.locator('#decrease-font-size').count()) === 1);

  // row-top should NOT have bold, italic, underline, text-color
  await check('row-top no bold', (await rowTop.locator('#bold').count()) === 0);
  await check('row-top no italic', (await rowTop.locator('#italic').count()) === 0);
  await check('row-top no underline', (await rowTop.locator('#underline').count()) === 0);
  await check('row-top no text-color', (await rowTop.locator('#text-color').count()) === 0);

  // All buttons in row-top have data-size=large
  const topButtons = rowTop.locator('.btn');
  const topButtonCount = await topButtons.count();
  let allLarge = true;
  for (let i = 0; i < topButtonCount; i++) {
    const size = await topButtons.nth(i).getAttribute('data-size');
    if (size !== 'large') { allLarge = false; break; }
  }
  await check('all row-top buttons have data-size=large', allLarge);

  // row-bottom should have bold, italic, underline, text-color
  await check('row-bottom has bold', (await rowBottom.locator('#bold').count()) === 1);
  await check('row-bottom has italic', (await rowBottom.locator('#italic').count()) === 1);
  await check('row-bottom has underline', (await rowBottom.locator('#underline').count()) === 1);
  await check('row-bottom has text-color', (await rowBottom.locator('#text-color').count()) === 1);

  // Check order: bold before italic before underline
  const boldBox = await rowBottom.locator('#bold').boundingBox();
  const italicBox = await rowBottom.locator('#italic').boundingBox();
  const underlineBox = await rowBottom.locator('#underline').boundingBox();
  await check('bold before italic', boldBox.x < italicBox.x);
  await check('italic before underline', italicBox.x < underlineBox.x);

  // All buttons in row-bottom have data-size=small
  const bottomButtons = rowBottom.locator('.btn');
  const bottomButtonCount = await bottomButtons.count();
  let allSmall = true;
  for (let i = 0; i < bottomButtonCount; i++) {
    const size = await bottomButtons.nth(i).getAttribute('data-size');
    if (size !== 'small') { allSmall = false; break; }
  }
  await check('all row-bottom buttons have data-size=small', allSmall);

  // (2) Clipboard group
  await check('clipboard group exists', (await count('.group[data-group="clipboard"]')) === 1);
  const clipboardGroup = page.locator('.group[data-group="clipboard"]');
  
  // Check group-label is last child
  const clipboardChildren = await clipboardGroup.locator('> *').count();
  const lastChild = clipboardGroup.locator('> *:last-child');
  await check('clipboard group-label is last child', (await lastChild.getAttribute('class'))?.includes('group-label'));
  await check('clipboard label text', (await clipboardGroup.locator('.group-label').textContent()) === 'Clipboard');

  // cut, copy, paste, copy-style all have data-size=small
  await check('cut has data-size=small', (await page.locator('#cut').getAttribute('data-size')) === 'small');
  await check('copy has data-size=small', (await page.locator('#copy').getAttribute('data-size')) === 'small');
  await check('paste has data-size=small', (await page.locator('#paste').getAttribute('data-size')) === 'small');
  await check('copy-style has data-size=small', (await page.locator('#copy-style').getAttribute('data-size')) === 'small');

  // Order: cut before copy before copy-style
  const cutX = (await page.locator('#cut').boundingBox()).x;
  const copyX = (await page.locator('#copy').boundingBox()).x;
  const copyStyleX = (await page.locator('#copy-style').boundingBox()).x;
  await check('cut before copy', cutX < copyX);
  await check('copy before copy-style', copyX < copyStyleX);

  // (3) Button attributes and toggle behavior
  // #bold attributes
  await check('#bold has data-kind=button', (await page.locator('#bold').getAttribute('data-kind')) === 'button');
  await check('#bold has data-command=bold', (await page.locator('#bold').getAttribute('data-command')) === 'bold');
  await check('#bold has aria-label=Bold', (await page.locator('#bold').getAttribute('aria-label')) === 'Bold');
  await check('#bold has title with shortcut', (await page.locator('#bold').getAttribute('title')) === 'Bold (Ctrl+B)');
  await check('#bold has data-size=small', (await page.locator('#bold').getAttribute('data-size')) === 'small');
  await check('#bold has aria-pressed=false initially', (await page.locator('#bold').getAttribute('aria-pressed')) === 'false');

  // #cut has no aria-pressed
  await check('#cut has no aria-pressed', (await page.locator('#cut').getAttribute('aria-pressed')) === null);

  // Click bold - should toggle to true
  await page.locator('#bold').click();
  await check('#bold aria-pressed=true after click', (await page.locator('#bold').getAttribute('aria-pressed')) === 'true');

  // Click bold again - should toggle back to false
  await page.locator('#bold').click();
  await check('#bold aria-pressed=false after second click', (await page.locator('#bold').getAttribute('aria-pressed')) === 'false');

  // Click italic while bold is false - italic should be true
  await page.locator('#italic').click();
  await check('#italic aria-pressed=true after click', (await page.locator('#italic').getAttribute('aria-pressed')) === 'true');
  await check('#bold aria-pressed=false when italic clicked', (await page.locator('#bold').getAttribute('aria-pressed')) === 'false');

  // Check exactly one aria-pressed=true exists
  const pressedCount = await page.locator('[aria-pressed="true"]').count();
  await check('exactly one aria-pressed=true', pressedCount === 1);

  // Click bold while italic is pressed - bold should be true, italic false
  await page.locator('#bold').click();
  await check('#bold aria-pressed=true when clicked', (await page.locator('#bold').getAttribute('aria-pressed')) === 'true');
  await check('#italic aria-pressed=false when bold clicked', (await page.locator('#italic').getAttribute('aria-pressed')) === 'false');

  // (4) Select and ColorPicker
  // #font-family is select with caption and caret
  await check('#font-family has data-kind=select', (await page.locator('#font-family').getAttribute('data-kind')) === 'select');
  await check('#font-family in row-top', (await rowTop.locator('#font-family').count()) === 1);
  await check('#font-family has .caption', (await page.locator('#font-family .caption').count()) === 1);
  await check('#font-family .caption text is Font', (await page.locator('#font-family .caption').textContent()) === 'Font');
  await check('#font-family has .caret', (await page.locator('#font-family .caret').count()) === 1);
  
  const fontFamilyBox = await page.locator('#font-family').boundingBox();
  await check('#font-family height 22-26', fontFamilyBox.height >= 22 && fontFamilyBox.height <= 26, `height=${fontFamilyBox.height}`);

  // #font-size is select
  await check('#font-size has data-kind=select', (await page.locator('#font-size').getAttribute('data-kind')) === 'select');
  await check('#font-size has .caption', (await page.locator('#font-size .caption').count()) === 1);
  await check('#font-size .caption text is Font Size', (await page.locator('#font-size .caption').textContent()) === 'Font Size');
  await check('#font-size has .caret', (await page.locator('#font-size .caret').count()) === 1);

  // #text-color is color-picker with color-bar
  await check('#text-color has data-kind=color-picker', (await page.locator('#text-color').getAttribute('data-kind')) === 'color-picker');
  await check('#text-color in row-bottom', (await rowBottom.locator('#text-color').count()) === 1);
  await check('#text-color has .color-bar', (await page.locator('#text-color .color-bar').count()) === 1);

  // (5) General checks
  // All buttons have non-empty aria-label, data-command, data-kind
  const allButtons = page.locator('.btn');
  const buttonCount = await allButtons.count();
  let allValid = true;
  for (let i = 0; i < buttonCount; i++) {
    const btn = allButtons.nth(i);
    const ariaLabel = await btn.getAttribute('aria-label');
    const dataCommand = await btn.getAttribute('data-command');
    const dataKind = await btn.getAttribute('data-kind');
    if (!ariaLabel || !dataCommand || !dataKind) {
      allValid = false;
      break;
    }
  }
  await check('all buttons have aria-label, data-command, data-kind', allValid);

  // All buttons are inside .group .elset .row
  for (let i = 0; i < buttonCount; i++) {
    const btn = allButtons.nth(i);
    const parentClasses = await btn.locator('..').getAttribute('class');
    if (!parentClasses || !parentClasses.includes('row')) {
      allValid = false;
      break;
    }
  }
  await check('all buttons inside .group .elset .row', allValid);

  // row-bottom buttons share same y (±6px)
  const boldBoxFull = await page.locator('#bold').boundingBox();
  const italicBoxFull = await page.locator('#italic').boundingBox();
  const underlineBoxFull = await page.locator('#underline').boundingBox();
  const textColorBox = await page.locator('#text-color').boundingBox();
  
  const boldY = boldBoxFull.y;
  const italicY = italicBoxFull.y;
  const underlineY = underlineBoxFull.y;
  const textColorY = textColorBox.y;
  
  await check('bold and italic same y (±6)', Math.abs(boldY - italicY) <= 6, `diff=${Math.abs(boldY - italicY)}`);
  await check('italic and underline same y (±6)', Math.abs(italicY - underlineY) <= 6, `diff=${Math.abs(italicY - underlineY)}`);
  await check('underline and text-color same y (±6)', Math.abs(underlineY - textColorY) <= 6, `diff=${Math.abs(underlineY - textColorY)}`);

  // row-top y < row-bottom y
  const fontFamilyY = (await page.locator('#font-family').boundingBox()).y;
  await check('row-top y < row-bottom y', fontFamilyY < boldY, `top=${fontFamilyY}, bottom=${boldY}`);

  // Buttons contain no .caption (except select controls which are handled separately)
  // Check that button kind controls don't have .caption
  const buttonControls = page.locator('.btn[data-kind="button"] .caption');
  await check('button controls have no .caption', (await buttonControls.count()) === 0);

  // Group count >= 2
  await check('at least 2 groups', (await count('.group')) >= 2, `count=${await count('.group')}`);

  // No page errors
  await check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  
  if (process.exitCode === 1) {
    console.log('\nGROUP FAILED');
  } else {
    console.log('\nGROUP OK');
  }
})().catch((e) => { console.error('PROBE CRASHED', e.message); process.exit(1); });
