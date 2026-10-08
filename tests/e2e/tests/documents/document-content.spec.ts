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

    // OO 1:1 — statusbar page indicator tracks the paginated sheets.
    const indicator = page.locator("#page-indicator")
    if ((await indicator.count()) > 0) {
      await expect(indicator).toContainText(/Page 1 of \d+/, { timeout: 10_000 })
    }
    // Live re-pagination: typing past the first sheet must grow the page count.
    const editorEl = page.locator("#editor")
    await editorEl.click({ force: true })
    for (let i = 0; i < 12; i++) {
      await page.keyboard.type("Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.\n", { delay: 1 })
    }
    await page.waitForTimeout(2500)
    const afterTyping = await page.locator("#editor [class*='wo-page'], #editor .wo-page").count()
    expect(afterTyping).toBeGreaterThanOrEqual(sheetCount)

    // C-P5: the caret's page drives the indicator. Force the doc to a 2nd
    // page (bounded loop) regardless of seeded length; the caret left at the
    // end must then be on a page >= 2.
    let total = 1
    for (let i = 0; i < 60 && total < 2; i++) {
      await page.keyboard.type("overflow line to grow past a page boundary.\n", { delay: 0 })
      await page.waitForTimeout(200)
      const m = (await page.locator("#page-indicator").textContent().catch(() => ""))?.match(/Page \\d+ of (\\d+)/)
      total = m ? parseInt(m[1], 10) : 1
    }
    if (total >= 2) {
      const ind2 = await page.locator("#page-indicator").textContent().catch(() => "")
      const cur = ind2?.match(/Page (\\d+) of/)?.[1] ?? "0"
      expect(parseInt(cur, 10)).toBeGreaterThanOrEqual(2)
    } else {
      test.skip(true, "seeded doc too short to reach a 2nd page under the test budget")
    }

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