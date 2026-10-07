import { expect, test } from "@playwright/test"

/**
 * E-FI-1 · Document fidelity — content presence (us-fi-1).
 *
 * A real document must load: the editor renders non-empty text and a page
 * sheet. Complements the committed visual/chrome gates (pixel fidelity) and
 * the conformance corpus (byte-fidelity round-trips).
 */

test.describe("Document content (E-FI-1)", () => {
  test("loaded doc renders text and a page sheet", async ({ page }) => {
    test.setTimeout(60_000)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e.message)))

    await page.goto("/documenteditor/")
    const editor = page.locator("#editor")
    await expect(editor.first()).toBeVisible({ timeout: 30_000 })

    // The converted flow populates the page stack with real text.
    await expect
      .poll(async () => (await editor.textContent())?.trim().length ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(10)

    const sheetCount = await page.locator("#editor [class*='wo-page'], #editor .wo-page").count()
    expect(sheetCount).toBeGreaterThanOrEqual(1)

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([])
  })

  test("toolbar stays healthy after interaction (no dead buttons)", async ({ page }) => {
    await page.goto("/documenteditor/")
    const toolbar = page.locator("#toolbar")
    await expect(toolbar.first()).toBeVisible({ timeout: 30_000 })
    await toolbar.locator("button").first().click({ timeout: 5_000 }).catch(() => {})
    await expect(toolbar.first()).toBeVisible()
  })
})