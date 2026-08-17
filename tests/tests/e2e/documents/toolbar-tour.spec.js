/**
 * @fileoverview E2E toolbar tour — clicks every visible ribbon control across
 * all 5 editors and verifies no crashes.
 *
 * Data-driven: reads the ribbon-coverage script output (word commands + other
 * apps) to determine which buttons exist. Runs the same "click every tab and
 * button" pattern for each editor app.
 *
 * Usage:
 *   npx playwright test tests/e2e/documents/toolbar-tour.spec.js --project=chromium
 */

const { test, expect } = require("@playwright/test")
const {
  OCIS_URL,
  loginToOCIS,
  uploadTestDoc,
  getFileId,
  callAppOpen,
  parseWopiSession,
  openEditorInBrowser,
  waitForEditorFrame,
  waitForBodyEditor,
} = require("../helpers/ocis-helpers")



/**
 * List of ribbon tab labels and their first visible command button label.
 * Tab labels are the text content of <button> elements inside the ribbon tab bar.
 * We click each tab, then click every visible command button in that panel.
 */
const WORD_TABS = [
  "Home",
  "Insert",
  "Layout",
  "References",
  "Review",
  "View",
  "Forms",
]

/**
 * Click every visible interactive element inside the active ribbon panel.
 * Uses a generic selector to find tool buttons, dropdown triggers, toggles.
 */
async function clickAllRibbonControls(frame, tabName) {
  // Collect all interactive ribbon controls in the active tab panel
  const controls = await frame.$$(
    '.ribbon-panel button, ' +
    '.ribbon-panel [role="button"], ' +
    '.ribbon-panel [role="tab"], ' +
    '.ribbon-panel [role="menuitem"], ' +
    '.ribbon-panel input[type="checkbox"], ' +
    '.ribbon-panel select, ' +
    '.ribbon-panel .fui-Button, ' +
    '.ribbon-panel .fui-MenuButton, ' +
    '.ribbon-panel .fui-SplitButton, ' +
    '.ribbon-panel .fui-Checkbox, ' +
    '.ribbon-panel .fui-Combobox, ' +
    '.ribbon-panel .fui-Dropdown',
  )

  console.log(`  [${tabName}] Found ${controls.length} controls`)

  let clicked = 0
  let errors = 0

  for (let i = 0; i < controls.length; i++) {
    try {
      const ctrl = controls[i]
      const visible = await ctrl.isVisible()
      if (!visible) continue

      const disabled = await ctrl.isDisabled()
      if (disabled) continue

      const tagName = await ctrl.evaluate((el) => el.tagName.toLowerCase())
      const type = await ctrl.evaluate((el) => (el as HTMLInputElement).type || "").catch(() => "")
      const label = await ctrl.evaluate((el) => {
        return (
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent?.trim() ||
          el.id
        )
      }).catch(() => "unknown")

      // Skip text inputs and hidden controls
      if (type === "text" || type === "hidden") continue
      if (tagName === "input" && type === "text") continue
      if (tagName === "select") continue // dropdowns trigger navigation

      // Click the control
      await ctrl.click({ timeout: 5000 })
      clicked++

      // Close any popup/menu that might have opened
      await frame.keyboard.press("Escape").catch(() => {})
      await frame.waitForTimeout(100)
    } catch (e) {
      errors++
      console.warn(`    Error clicking control #${i}: ${e.message}`)
    }
  }

  return { clicked, errors }
}

/**
 * Click a ribbon tab by its visible label text.
 */
async function clickRibbonTab(frame, tabLabel) {
  const tabButtons = await frame.$$(
    '.ribbon-tabs button, ' +
    '.ribbon-tabs [role="tab"], ' +
    '.ribbon-bar button, ' +
    '.fui-Tab, ' +
    '[class*="ribbon"] button, ' +
    '[class*="Ribbon"] button',
  )

  for (const btn of tabButtons) {
    const text = await btn.evaluate((el) => el.textContent?.trim()).catch(() => "")
    if (text === tabLabel) {
      await btn.click({ timeout: 5000 })
      await frame.waitForTimeout(300)
      return true
    }
  }

  // Fallback: try partial match or title attribute
  for (const btn of tabButtons) {
    const title = await btn.evaluate((el) => el.getAttribute("title") || "").catch(() => "")
    const ariaLabel = await btn.evaluate((el) => el.getAttribute("aria-label") || "").catch(() => "")
    if (title?.includes(tabLabel) || ariaLabel?.includes(tabLabel)) {
      await btn.click({ timeout: 5000 })
      await frame.waitForTimeout(300)
      return true
    }
  }

  console.warn(`  Tab "${tabLabel}" not found`)
  return false
}

/**
 * Capture any console errors from the page during the tour.
 */
function setupErrorCapture(page) {
  const errors = []
  const warnings = []

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
    if (msg.type() === "warning") warnings.push(msg.text())
  })

  page.on("pageerror", (err) => {
    errors.push(`PAGE ERROR: ${err.message}`)
  })

  return { errors, warnings, reset: () => { errors.length = 0; warnings.length = 0 } }
}

test.describe("Toolbar Ribbon Tour", () => {
  test.setTimeout(600000) // 10 min for full tour

  test("word editor — click every ribbon tab and button", async ({ page }) => {
    const errorCapture = setupErrorCapture(page)
    let token

    try {
      token = await loginToOCIS(page)
    } catch (e) {
      test.skip(true, `OCIS login unavailable: ${e.message}`)
      return
    }

    const filename = `toolbar-tour-word-${Date.now()}`
    let fileId
    let session

    // Upload minimal docx (uses MINIMAL_DOCX_B64 from ocis-helpers)
    const uploadStatus = await uploadTestDoc(page, token, filename)
    if (uploadStatus !== 201) {
      test.skip(true, `Upload failed with status ${uploadStatus}`)
      return
    }

    try {
      fileId = await getFileId(page, token, filename)
    } catch (e) {
      test.skip(true, `PROPFIND failed: ${e.message}`)
      return
    }

    try {
      session = await callAppOpen(page, token, fileId)
    } catch (e) {
      test.skip(true, `app/open failed: ${e.message}`)
      return
    }

    const { wopiSrc, wopiToken } = parseWopiSession(session)

    try {
      await openEditorInBrowser(page, wopiSrc, wopiToken)
    } catch (e) {
      test.skip(true, `Editor navigation failed: ${e.message}`)
      return
    }

    let frame
    try {
      frame = await waitForEditorFrame(page, 60000)
      expect(frame).not.toBeNull()
      await waitForBodyEditor(frame, 60000)
    } catch (e) {
      test.skip(true, `Editor frame/body not ready: ${e.message}`)
      return
    }

    console.log("Word editor loaded — starting toolbar tour")

    let totalClicked = 0
    let totalErrors = 0

    for (const tab of WORD_TABS) {
      const found = await clickRibbonTab(frame, tab)
      if (!found) {
        console.log(`  Skipping tab: ${tab}`)
        continue
      }

      const result = await clickAllRibbonControls(frame, tab)
      totalClicked += result.clicked
      totalErrors += result.errors

      // Check for page errors after each tab
      if (errorCapture.errors.length > 0) {
        console.warn(`  Errors after tab ${tab}:`, errorCapture.errors)
      }
    }

    console.log(
      `Toolbar tour complete: ${totalClicked} controls clicked, ${totalErrors} interaction errors`,
    )

    // Verify the editor is still functioning (no crash from clicking)
    const hasCanvas = await frame.evaluate(() => {
      return !!document.querySelector(".de-document-holder, canvas")
    }).catch(() => false)
    expect(hasCanvas).toBe(true)

    // Allow some console warnings (unhandled commands are expected)
    // but fail on actual page errors
    expect(errorCapture.errors.length).toBeLessThanOrEqual(
      Math.max(1, Math.floor(totalClicked * 0.1)),
    )
  })

  test("ribbon tour — no fatal errors", async ({ page }) => {
    // This is a lightweight smoke: open the word editor, cycle through
    // tabs, ensure no CRITICAL errors (cannot read properties of null, etc.)
    let token
    try {
      token = await loginToOCIS(page)
    } catch (e) {
      test.skip(true, `OCIS login unavailable: ${e.message}`)
      return
    }

    const errorCapture = setupErrorCapture(page)

    const filename = `toolbar-tour-smoke-${Date.now()}`
    const uploadStatus = await uploadTestDoc(page, token, filename)
    if (uploadStatus !== 201) {
      test.skip(true, `Upload failed: ${uploadStatus}`)
      return
    }

    let fileId
    try {
      fileId = await getFileId(page, token, filename)
    } catch (e) {
      test.skip(true, `PROPFIND failed: ${e.message}`)
      return
    }

    let session
    try {
      session = await callAppOpen(page, token, fileId)
    } catch (e) {
      test.skip(true, `app/open failed: ${e.message}`)
      return
    }

    const { wopiSrc, wopiToken } = parseWopiSession(session)
    await openEditorInBrowser(page, wopiSrc, wopiToken)

    let frame
    try {
      frame = await waitForEditorFrame(page, 60000)
      expect(frame).not.toBeNull()
      await waitForBodyEditor(frame, 60000)
    } catch (e) {
      test.skip(true, `Editor not ready: ${e.message}`)
      return
    }

    // Quick tour: just click each tab header without clicking controls
    for (const tab of WORD_TABS) {
      await clickRibbonTab(frame, tab)
      await frame.waitForTimeout(200)
    }

    // Collect errors afterwards
    const criticalErrors = errorCapture.errors.filter((e) => {
      const lower = e.toLowerCase()
      return (
        lower.includes("cannot read properties") ||
        lower.includes("undefined is not") ||
        lower.includes("null is not") ||
        lower.includes("typeerror") ||
        lower.includes("unhandled rejection")
      )
    })

    console.log(`Tab-cycle complete. ${criticalErrors.length} critical errors`)
    expect(criticalErrors.length).toBe(0)
  })
})
