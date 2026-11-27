// Gate probe for tools module: wordCount, setDocumentLanguage, draw-language-select, toggleSpellCheck
const { chromium } = require('@playwright/test');
const url = process.argv[2];

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ 
    viewport: { width: 1600, height: 1000 }, 
    permissions: ['clipboard-read', 'clipboard-write'] 
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });

  const status = () => page.textContent('#status');
  const wait_status = async (expected, description) => {
    const prev = await status();
    await page.waitForFunction((prev, expected) => {
      const s = document.querySelector('#status')?.textContent;
      return s !== undefined && s !== null && s !== prev && (expected === undefined || s === expected || s.startsWith(expected));
    }, { timeout: 5000 }, prev, expected);
    return await status();
  };

  // Helper to click on page and type
  const type_in_editor = async (text) => {
    await page.locator('.page').first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };

  // Helper to get caret position
  const caret_bbox = async () => {
    return await page.locator('.caret').boundingBox();
  };

  // ── 1. Word count basics: type text, click word-count, verify counts and caret restoration ──
  await page.waitForSelector('.page canvas', { timeout: 30000 });
  check('page loads', (await page.locator('.page canvas').count()) > 0);

  // Click to focus editor
  await page.locator('.page').first().click();
  await page.waitForTimeout(100);
  check('ime-bridge has focus after page click', 
    await page.evaluate(() => document.activeElement?.id) === 'ime-bridge',
    await page.evaluate(() => document.activeElement?.id));

  // Type 'hello world'
  await type_in_editor('hello world');
  check('typed text status', (await status()) === 'insert ok', await status());

  // Get caret position before word count
  const caretBefore = await caret_bbox();
  check('caret is visible after typing', caretBefore !== null, `caret: ${caretBefore ? 'visible' : 'hidden'}`);

  // Switch to Home tab
  await page.click('[role=tab]#tab-home');
  await page.waitForTimeout(200);

  // Click word-count button
  await page.click('#word-count');
  
  // Wait for wordCount to complete
  const finalStatus = await wait_status('wordCount ok');
  check('wordCount status is ok with 2 words', 
    finalStatus === 'wordCount ok (2 words)', 
    `status: ${finalStatus}`);

  // Check the panel display
  const toolsText = await page.locator('#ops-tools').textContent();
  check('ops-tools shows Words 2', toolsText.includes('Words 2'), `text: ${toolsText}`);
  check('ops-tools shows Characters 9', toolsText.includes('Characters 9'), `text: ${toolsText}`);
  check('ops-tools shows Characters with spaces 11', toolsText.includes('Characters with spaces 11'), `text: ${toolsText}`);
  check('ops-tools shows Paragraphs 1', toolsText.includes('Paragraphs 1'), `text: ${toolsText}`);

  // Check caret is restored
  await page.waitForTimeout(100);
  const caretAfter = await caret_bbox();
  check('caret restored after wordCount', 
    caretAfter !== null,
    `caret before: ${JSON.stringify(caretBefore)}, after: ${JSON.stringify(caretAfter)}`);
  
  if (caretBefore && caretAfter) {
    const dx = Math.abs(caretBefore.x - caretAfter.x);
    const dy = Math.abs(caretBefore.y - caretAfter.y);
    check('caret position within 1px', dx <= 1 && dy <= 1, 
      `dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);
  }

  // Check text is intact
  const selectedAfter = await page.evaluate(() => window.woProbe('selected'));
  // After wordCount, the selection should be cleared (caret restored), so selected text should be empty
  // But let's check engine state via select-all
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(150);
  const selectedAll = await page.evaluate(() => window.woProbe('selected'));
  check('text intact after wordCount', selectedAll === 'hello world', `selected: ${selectedAll}`);

  // Focus should be back in editor
  check('focus back in editor after wordCount', 
    await page.evaluate(() => document.activeElement?.id) === 'ime-bridge',
    await page.evaluate(() => document.activeElement?.id));

  // ── 2. setDocumentLanguage: honest Err ──
  await page.click('#set-document-language');
  await page.waitForTimeout(200);
  const langStatus = await status();
  check('setDocumentLanguage failed with honest Err', 
    langStatus === 'setDocumentLanguage failed — the engine has no language op',
    `status: ${langStatus}`);

  // ── 3. toggleSpellCheck: honest Err (from Home tab) ──
  // First check the checkbox state
  const spellBefore = await page.locator('#spell-checking').getAttribute('aria-pressed');
  await page.click('#spell-checking');
  await page.waitForTimeout(200);
  const spellStatus = await status();
  check('toggleSpellCheck failed with honest Err', 
    spellStatus === 'toggleSpellCheck failed — no dictionaries are embedded — spelling is not checked',
    `status: ${spellStatus}`);
  
  // Check aria-pressed toggled (button itself toggles regardless of success)
  const spellAfter = await page.locator('#spell-checking').getAttribute('aria-pressed');
  check('spell-checking aria-pressed toggled', 
    spellBefore !== spellAfter,
    `before: ${spellBefore}, after: ${spellAfter}`);

  // ── 4. Edit mode: draw-word-count ──
  await page.evaluate(() => window.woSetEditMode(true));
  await page.waitForTimeout(200);

  // Switch to Draw tab
  await page.click('[role=tab]#tab-draw');
  await page.waitForTimeout(200);

  // Clear any existing selection and focus editor
  await page.locator('.page').first().click();
  await page.waitForTimeout(100);

  // Save caret before
  const caretBeforeDraw = await caret_bbox();

  // Click draw-word-count
  await page.click('#draw-word-count');
  await page.waitForTimeout(200);

  const drawWcStatus = await wait_status('wordCount ok');
  check('draw-word-count status is ok with 2 words', 
    drawWcStatus === 'wordCount ok (2 words)',
    `status: ${drawWcStatus}`);

  // Check caret restored in Draw tab too
  await page.waitForTimeout(100);
  const caretAfterDraw = await caret_bbox();
  if (caretBeforeDraw && caretAfterDraw) {
    const dx = Math.abs(caretBeforeDraw.x - caretAfterDraw.x);
    const dy = Math.abs(caretBeforeDraw.y - caretAfterDraw.y);
    check('caret restored after draw-word-count', dx <= 1 && dy <= 1, 
      `dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);
  }

  // ── 5. draw-language-select: honest Err ──
  await page.locator('#draw-language-select').selectOption({ index: 0 });
  await page.waitForTimeout(200);
  const drawLangStatus = await wait_status('draw-language-select failed');
  check('draw-language-select failed with honest Err', 
    drawLangStatus === 'draw-language-select failed — the document language is a display value only — the engine has no language op',
    `status: ${drawLangStatus}`);

  // ── 6. draw-spell-checking: honest Err ──
  await page.click('#draw-spell-checking');
  await page.waitForTimeout(200);
  const drawSpellStatus = await wait_status('toggleSpellCheck failed');
  check('draw-spell-checking failed with honest Err', 
    drawSpellStatus === 'toggleSpellCheck failed — no dictionaries are embedded — spelling is not checked',
    `status: ${drawSpellStatus}`);

  // ── 7. View tab: spellcheck command ──
  await page.click('[role=tab]#tab-view');
  await page.waitForTimeout(200);

  await page.click('#spellcheck');
  await page.waitForTimeout(200);
  const viewSpellStatus = await wait_status('toggleSpellCheck failed');
  check('spellcheck (View) failed with honest Err', 
    viewSpellStatus === 'toggleSpellCheck failed — no dictionaries are embedded — spelling is not checked',
    `status: ${viewSpellStatus}`);

  // ── 8. No page errors ──
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();

  if (failed === 0) {
    console.log('\nMODULE OK');
  } else {
    console.log(`\nMODULE: ${failed} FAILED`);
  }
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('PROBE CRASHED', e.stack || e.message);
  process.exit(2);
});
