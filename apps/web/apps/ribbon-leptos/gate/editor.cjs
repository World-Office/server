// Editor gate: the canvas host paints pages from the engine, and input reaches the document —
// click → caret, typed text (ASCII and non-ASCII), IME commit, select-all, ribbon → repaint.
// Exit code is the gate result. Every check fails loudly; nothing is skipped.
const base = process.argv[2]
const { chromium } = require('playwright')

let failed = 0
let xfailed = 0
// KNOWN GAP, visible: printed as XFAIL, never silent. `WO_RUN_XFAILS=1` turns it into a hard check.
const xfail = (name, ok, detail = '') => {
  if (ok || process.env.WO_RUN_XFAILS) return check(name, ok, detail)
  xfailed++
  console.log(`XFAIL editor: ${name}${detail ? ' — ' + detail : ''}`)
}
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} editor: ${name}${detail ? ' — ' + detail : ''}`)
}
// Page pixels, summarized: dark = glyph coverage, white = page background.
const pixels = (page) => page.evaluate(() => {
  const c = document.querySelector('.page canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let dark = 0, white = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 128 && d[i + 1] < 128 && d[i + 2] < 128) dark++
    else if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) white++
  }
  return { w: c.width, h: c.height, dark, white, total: d.length / 4 }
})
const status = (page) => page.textContent('#status')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await page.waitForSelector('.page canvas', { timeout: 30000 })

  // ── 1. a page is painted: engine geometry, white paper. The blank template is ONE EMPTY
  //        paragraph, so zero glyphs here is the correct rendering (glyphs are checked in 3). ──
  await page.waitForTimeout(300) // let the paint effect run
  const p0 = await pixels(page)
  check('canvas is the engine\'s A4 (793×1123)', p0.w === 793 && p0.h === 1123, `${p0.w}×${p0.h}`)
  check('blank page is paper (≥95% white, no glyphs)', p0.white / p0.total > 0.95 && p0.dark === 0,
    `${(100 * p0.white / p0.total).toFixed(1)}% white, dark=${p0.dark}`)
  check('no page errors on load', errors.length === 0, errors.join(' | '))

  // ── 2. click on the empty page: focus moves to the input; the engine's hit-test is
  //        character-based, so an empty line reports an honest miss (no caret at the corner) ──
  const canvas = page.locator('.page canvas')
  await canvas.click({ position: { x: 100, y: 100 } })
  await page.waitForTimeout(100)
  check('click on empty page is an honest miss', (await status(page)) === 'click missed the text', await status(page))
  check('no caret drawn for a miss', await page.locator('.caret').count() === 0)
  check('input textarea has focus after click', await page.evaluate(() => document.activeElement?.id) === 'ime-bridge')

  // ── 3. typed text reaches the document: glyphs appear (fonts render under wasm), caret shown ──
  await page.keyboard.type('Hello')
  await page.waitForTimeout(150)
  check('typed text reported ok (input-event path)', (await status(page)) === 'insert ok', await status(page))
  const p1 = await pixels(page)
  check('typing paints glyphs', p1.dark > 50, `dark ${p0.dark} → ${p1.dark}`)
  check('caret is drawn after typing', await page.locator('.caret').count() === 1)

  // ── 4. click on the text → hit-test → caret placed there ──
  await canvas.click({ position: { x: 100, y: 100 } })
  await page.waitForTimeout(100)
  check('click on text hits the line', (await status(page)).startsWith('click ok'), await status(page))
  check('caret stays visible after the click', await page.locator('.caret').count() === 1)

  // ── 5. blinking (530 ms period; sample until both phases are seen — a fixed wait can straddle two ticks) ──
  const phases = new Set()
  for (let i = 0; i < 30 && phases.size < 2; i++) {
    phases.add(await page.locator('.caret').evaluate((el) => el.classList.contains('off')))
    await page.waitForTimeout(50)
  }
  check('caret blinks', phases.size === 2, `phases seen: ${[...phases].join(',')}`)

  // ── 6. text without any keydown: `insertText` fires only `input` events — the path of mobile
  //       keyboards, dictation and emoji pickers (the React host dropped every non-ASCII key) ──
  await page.keyboard.insertText('ü')
  await page.waitForTimeout(150)
  const p2 = await pixels(page)
  check('input-event text (non-ASCII, no keydown) reaches the document',
    (await status(page)) === 'insert ok' && p2.dark > p1.dark,
    `${await status(page)}, dark ${p1.dark} → ${p2.dark}`)
  check('textarea stays drained (text lives in the document)', await page.locator('#ime-bridge').inputValue() === '')
  check('input channel transcript accumulates', await page.locator('#ime-out').getAttribute('data-committed') === 'Helloü',
    await page.locator('#ime-out').getAttribute('data-committed'))

  // ── 7. ribbon → engine → REPaint: with a selection, Bold re-renders the glyphs. (With a
  //        collapsed cursor Bold only changes insertion formatting — pixels rightly stay.) ──
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(150)
  const selDark = (await pixels(page)).dark
  await page.locator('#toolbar [data-command="bold"]').click()
  await page.waitForTimeout(150)
  const p3 = await pixels(page)
  // Bold must RENDER: three engine defects once hid it under wasm (edit-path layout engine and
  // raster canvas loaded no bold face; the face query fell back to the first face regardless of
  // weight) — the host never saw them because system fonts answered the query.
  check('ribbon bold repaints the selected text (bold face rendered)', p3.dark > selDark * 1.15, `dark ${selDark} → ${p3.dark}`)
  // KNOWN GAP (engine): get_run_formatting reports default formatting at a cursor sitting at the
  // END of a run after range formatting — the ribbon mirrors the engine, so bold shows unpressed
  // although the pixels above prove the run is bold. Collapsed-cursor toggles report correctly.
  xfail('bold pressed after range bold (engine get_run_formatting at end-of-run)',
    await page.locator('#toolbar [data-command="bold"]').getAttribute('aria-pressed') === 'true',
    `aria-pressed=${await page.locator('#toolbar [data-command="bold"]').getAttribute('aria-pressed')}`)
  check('ribbon click keeps the keyboard in the editor', await page.evaluate(() => document.activeElement?.id) === 'ime-bridge')

  // ── 8. selection: rects drawn, caret hidden; ArrowLeft collapses it back to a caret.
  //       (The engine clears the selection after a formatting command, so select again.) ──
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(150)
  const sels = await page.locator('.sel').count()
  check('ctrl+a draws selection rects', sels > 0 && (await status(page)).startsWith('key a ok'), `rects=${sels}, ${await status(page)}`)
  check('no caret while selecting', await page.locator('.caret').count() === 0)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(150)
  check('ArrowLeft ends the selection', await page.locator('.sel').count() === 0)
  check('caret is back after the selection ends', await page.locator('.caret').count() === 1)

  // ── 9. IME: real composition events through CDP → commit inserts into the document ──
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 })
  await page.waitForTimeout(100)
  check('composition in flight is shown', await page.locator('#ime-out').getAttribute('data-composed') === 'にほん')
  const darkBefore = (await pixels(page)).dark
  await cdp.send('Input.insertText', { text: '日本語' })
  await page.waitForTimeout(150)
  check('IME commit reported ok', (await status(page)).startsWith('ime commit ok'), await status(page))
  check('IME commit paints glyphs', (await pixels(page)).dark !== darkBefore)
  check('IME bridge textarea is drained after commit', await page.locator('#ime-bridge').inputValue() === '')

  // ── 10. Tab is not trapped ──
  await page.keyboard.press('Tab')
  check('Tab leaves the editor (focus not trapped)', await page.evaluate(() => document.activeElement?.id) !== 'ime-bridge')

  // ── 11. unknown Ctrl combos belong to the browser (no engine no-op, view untouched) ──
  const before11 = await status(page)
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(150)
  check('unknown ctrl combo is left to the browser', (await status(page)) === before11 && await page.locator('.page canvas').count() === 1,
    `status ${before11} → ${await status(page)}`)

  check('no page errors overall', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(failed ? `editor-gate: ${failed} FAILED` : `editor-gate: all PASS${xfailed ? ` (${xfailed} known gap${xfailed > 1 ? 's' : ''})` : ''}`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('editor-gate crashed: ' + (e.stack || e)); process.exit(2) })
