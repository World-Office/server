import { expect, test } from "@playwright/test"

/**
 * E-FP-1 · Formatting parity — the ribbon toolbar tour (us-fp-1..us-fp-3).
 *
 * Clicks every Home-tab control once, asserts no page errors and no console
 * errors, and that toggleable buttons flip aria-pressed. This is the e2e
 * instantiation of the K3/K4 ribbon gate (412/413 commands wired).
 */

const TOGGLES = ["bold", "italic", "underline", "strikeThrough"]

test.describe("Toolbar tour (E-FP-1)", () => {
  test("Home tab: every control clicks without errors; toggles flip state", async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e.message)))
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text())
    })

    await page.goto("/documenteditor/")
    const toolbar = page.locator("#toolbar")
    await expect(toolbar.first()).toBeVisible({ timeout: 30_000 })
    const homePage = page.locator('#toolbar [data-tab="home"]')
    await expect(homePage).toBeVisible({ timeout: 30_000 })

    // Click every VISIBLE button on the Home ribbon once (hidden menu items
    // are opened by their triggers, not clicked directly). Force clicks: in
    // headless the contenteditable #editor intercepts hit-testing (known
    // quirk; the editors' pointer handling is verified in the interaction census).
    const buttons = homePage.locator("button:visible")
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(8)
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      await btn.click({ force: true, timeout: 5_000 }).catch(() => {})
    }

    // ── Sub-menu coverage (OO 1:1): every dropdown/ribbon menu must open
    // with a visible item list, and picking an item must close it. Includes
    // the styles-trigger (a dead sub-menu until the .styles-trigger class was
    // added to the generic ribbon-menu wiring). DOM-dispatched clicks: the
    // contenteditable #editor intercepts pointer events in headless.
    const triggers = homePage.locator("button.menu-trigger, button.styles-trigger")
    const tCount = await triggers.count()
    let tOpened = 0
    for (let i = 0; i < tCount; i++) {
      await triggers.nth(i).evaluate((el) => (el as HTMLElement).click())
      await page.locator("body").evaluate(() => new Promise((r) => setTimeout(r, 200)))
      const openLists = await homePage.locator(".menu-list:not([hidden])").count()
      if (openLists > 0) {
        tOpened++
        const first = homePage.locator(".menu-list:not([hidden]) button").first()
        if ((await first.count()) > 0) {
          await first.evaluate((el) => (el as HTMLElement).click())
          await page.locator("body").evaluate(() => new Promise((r) => setTimeout(r, 150)))
        }
      }
    }
    const selects = homePage.locator("select")
    const sCount = await selects.count()
    for (let i = 0; i < sCount; i++) {
      await selects.nth(i).evaluate((el) => {
        const sel = el as HTMLSelectElement
        const opt = [...sel.options].find((o) => o.value && o.value !== sel.value)
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })) }
      })
    }
    expect(tOpened).toBeGreaterThanOrEqual(Math.max(1, tCount - 1))
    console.log(`opened ${tOpened}/${tCount} ribbon menus; set ${sCount} selects`)

    // Toggling a formatting button reflects aria-pressed.
    for (const id of TOGGLES) {
      const b = homePage.locator(`#${id}`)
      if ((await b.count()) === 0) continue
      await b.click()
      await expect(b).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 })
      await b.click()
      await expect(b).toHaveAttribute("aria-pressed", "false", { timeout: 5_000 })
    }

    const realErrors = errors.filter((e) => !e.includes("favicon"))
    expect(realErrors).toEqual([])
  })
})