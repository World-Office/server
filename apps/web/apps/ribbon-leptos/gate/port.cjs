// Ribbon port gate: the Leptos ribbon renders the full generated spec and a click reaches the
// engine through the same wasm module. Exit code is the gate result.
const base = process.argv[2]
const { chromium } = require('playwright')

const fail = (m) => { console.error('port-gate FAIL: ' + m); process.exit(1) }
const ok = (m) => console.log('port-gate ok: ' + m)

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await page.waitForSelector('#ribbon-tabs .tab', { timeout: 30000 })

  // ── spec parity: the DOM carries what the generated spec carries ──
  const tabs = await page.$$eval('#ribbon-tabs .tab', (els) => els.map((e) => e.textContent.trim()))
  if (tabs.length !== 11) fail(`expected 11 tabs, got ${tabs.length}: ${tabs.join(',')}`)
  // order and labels exactly as word-ribbon.ts declares them
  if (tabs.join(',') !== 'Home,Insert,Draw,Layout,References,Collaboration,Protection,View,Plugins,AI,Chart Design')
    fail(`tab order/labels differ from word-ribbon.ts: ${tabs.join(',')}`)
  ok(`11 tabs in spec order: ${tabs.join(',')}`)

  // ── edit-mode gating: Insert is visible now, hidden when isEditMode flips ──
  const status0 = await page.textContent('#status')
  if (!status0.startsWith('ready')) fail(`engine did not open the blank doc: status="${status0}"`)
  ok(`engine opened blank docx: status="${status0}"`)

  // ── group + control counts for the Home tab ──
  const home = await page.evaluate(() => ({
    groups: document.querySelectorAll('.panel .group').length,
    controls: document.querySelectorAll('.panel .group [data-kind]').length,
  }))
  // clipboard, font, paragraph, styles, editing, language, view — the 7 groups of word-ribbon.ts
  if (home.groups !== 7) fail(`Home tab: expected 7 groups, got ${home.groups}`)
  ok(`Home: ${home.groups} groups, ${home.controls} controls`)

  // ── the real contract: click Bold → engine → button shows pressed ──
  const bold = page.locator('#toolbar [data-command="bold"]')
  await bold.click()
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('bold ok'), null, { timeout: 5000 })
    .catch(async () => fail('bold never reported ok: ' + (await page.textContent('#status'))))
  await page.waitForFunction(() => document.querySelector('[data-command="bold"]').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 })
    .catch(() => fail('bold is not pressed after click — engine state did not reach the ribbon'))
  ok('bold click → engine → aria-pressed=true (engine state reached the ribbon)')

  await bold.click()
  await page.waitForFunction(() => document.querySelector('[data-command="bold"]').getAttribute('aria-pressed') === 'false', null, { timeout: 5000 })
    .catch(() => fail('bold still pressed after second click — toggle did not un-bold'))
  ok('second bold click → aria-pressed=false (toggle round-trip)')

  // ── structure op through the UI ──
  await page.click('#toolbar [data-command="bulletList"]')
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('bulletList ok'), null, { timeout: 5000 })
    .catch(async () => fail('bullet-list not ok: ' + (await page.textContent('#status'))))
  ok('bulletList → engine structure op ok')

  // ── a non-engine command is reported honestly, not as success ──
  // (paste used to be the example; since the clipboard module it IS an engine op — the AI tab's
  // settings button is owned by no module)
  await page.click('[role=tab]#tab-ai')
  await page.click('#toolbar [data-command="aiSettings"]')
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('not an engine op yet'), null, { timeout: 5000 })
    .catch(async () => fail('aiSettings should be reported as not-an-engine-op: ' + (await page.textContent('#status'))))
  ok('aiSettings → honestly reported as "not an engine op yet"')

  // ── context predicate drives visibility live: leave edit mode → Insert/Draw/Chart tabs hide ──
  const count = () => page.locator('#ribbon-tabs .tab').count()
  if ((await count()) !== 11) fail('expected 11 tabs before leaving edit mode')
  await page.evaluate(() => window.woSetEditMode(false))
  await page.waitForFunction(() => document.querySelectorAll('#ribbon-tabs .tab').length < 11, null, { timeout: 5000 })
    .catch(() => fail('tabs did not hide after leaving edit mode — ctx predicate is not live'))
  const after = await count()
  ok(`edit-mode predicate is live: 11 tabs → ${after} after woSetEditMode(false)`)
  await page.evaluate(() => window.woSetEditMode(true))
  await page.waitForFunction(() => document.querySelectorAll('#ribbon-tabs .tab').length === 11, null, { timeout: 5000 })
  ok('back to 11 tabs in edit mode')

  if (errors.length) fail('page errors: ' + errors.join(' | '))
  ok('no page errors')
  await browser.close()
})().catch((e) => fail(e.message))
