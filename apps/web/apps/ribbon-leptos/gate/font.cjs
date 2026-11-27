const { chromium } = require('@playwright/test');

async function run() {
  const url = process.argv[2];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  const log = (msg) => console.log(msg);

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');

    // 1. Basic setup
    await page.evaluate(() => window.woSetEditMode(true));
    await page.click('[role=tab]#tab-home');
    await page.locator('.page').first().click();
    await page.keyboard.type('sample text');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'insert ok');
    
    // Select 'sample text'
    await page.keyboard.press('Control+A');
    const selected = await page.evaluate(() => window.woProbe('selected'));
    if (selected === 'sample text') {
      log('PASS selected text');
    } else {
      log(`FAIL selected text — got ${selected}`);
    }

    // 2. Font Size
    await page.selectOption('#font-size', '20pt');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'font-size ok (20 pt)');
    const sizeStatus = await page.textContent('#status');
    if (sizeStatus === 'font-size ok (20 pt)') {
      log('PASS font-size status');
    } else {
      log(`FAIL font-size status — got ${sizeStatus}`);
    }
    const fmt = await page.evaluate(() => window.woProbe('runfmt'));
    if (fmt.fontSize === 40) {
      log('PASS font-size engine (40 half-pt)');
    } else {
      log(`FAIL font-size engine — got ${fmt.fontSize}`);
    }

    // 3. Font Family
    await page.selectOption('#font-family', 'Aptos');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'font-family ok (Aptos — no embedded face, rendered with the fallback)');
    const familyStatus = await page.textContent('#status');
    if (familyStatus === 'font-family ok (Aptos — no embedded face, rendered with the fallback)') {
      log('PASS font-family status');
    } else {
      log(`FAIL font-family status — got ${familyStatus}`);
    }
    const fmt2 = await page.evaluate(() => window.woProbe('runfmt'));
    if (fmt2.fontName === 'Aptos') {
      log('PASS font-family engine');
    } else {
      log(`FAIL font-family engine — got ${fmt2.fontName}`);
    }

    // 4. Text Color
    const darkBefore = await page.evaluate(() => window.woProbe('dark').dark);
    await page.click('#text-color');
    await page.waitForSelector('#ops-font.open');
    await page.click('button[title="#ff0000"]');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'text-color ok (#ff0000)');
    const colorStatus = await page.textContent('#status');
    if (colorStatus === 'text-color ok (#ff0000)') {
      log('PASS text-color status');
    } else {
      log(`FAIL text-color status — got ${colorStatus}`);
    }

    const darkAfter = await page.evaluate(() => window.woProbe('dark').dark);
    const redPixels = await page.evaluate(() => {
      const c = document.querySelector('.page canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 180 && d[i+1] < 90 && d[i+2] < 90) count++;
      }
      return count;
    });
    if (redPixels > 0 && darkAfter < darkBefore) {
      log(`PASS text-color pixels — red: ${redPixels}, dark: ${darkAfter} < ${darkBefore}`);
    } else {
      log(`FAIL text-color pixels — red: ${redPixels}, dark: ${darkAfter} vs ${darkBefore}`);
    }

    // 5. Highlight Color
    await page.click('#highlight-color');
    await page.waitForSelector('#ops-font.open');
    await page.click('button[title="#ffff00"]');
    await page.waitForFunction((prev) => {
      const s = document.querySelector('#status').textContent;
      return s && s.startsWith('highlight ok (#ffff00');
    }, 'text-color ok (#ff0000)');
    const highStatus = await page.textContent('#status');
    
    const isRendered = highStatus === 'highlight ok (#ffff00 — rendered)';
    const isStored = highStatus === 'highlight ok (#ffff00 — stored, not rendered yet)';

    if (isRendered || isStored) {
      log(`PASS highlight status — ${highStatus}`);
    } else {
      log(`FAIL highlight status — got ${highStatus}`);
    }

    const yellowPixels = await page.evaluate(() => {
      const c = document.querySelector('.page canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i+1] > 200 && d[i+2] < 110) count++;
      }
      return count;
    });

    if (isRendered) {
      if (yellowPixels > 0) {
        log(`PASS highlight rendering — ${yellowPixels} yellow pixels`);
      } else {
        log(`FAIL highlight rendering — 0 yellow pixels`);
      }
    } else if (isStored) {
      if (yellowPixels === 0) {
        log(`XFAIL highlight rendering — 0 yellow pixels`);
      } else {
        log(`FAIL highlight stored but pixels found — ${yellowPixels}`);
      }
    }

    // 6. Escape to hide
    await page.keyboard.press('Escape');
    const isVisible = await page.isVisible('#ops-font.open');
    if (!isVisible) {
      log('PASS escape hides popup');
    } else {
      log('FAIL escape does not hide popup');
    }

  } catch (e) {
    log(`FAIL runtime error — ${e.message}`);
  } finally {
    await browser.close();
  }
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
