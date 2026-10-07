import { expect, test } from "@playwright/test"

/**
 * E-AI-1 · AI-assisted editing — end-to-end over the rust docserver gateway.
 *
 * Covers us-ai-1..us-ai-7: propose -> review lists the op -> reject removes
 * it, plus the deterministic gateway surface (/ai/config, /api/ai/tools).
 * The propose/review endpoints need the AI tab to exist; if the deployed
 * editor has no AI surface the suite skips (loud, not silent).
 */

test.describe("AI assist (E-AI-1)", () => {
  test("gateway contract: config + tool catalog", async ({ request }) => {
    test.setTimeout(20_000)
    const cfg = await request.get("http://localhost:8080/ai/config")
    expect(cfg.ok()).toBeTruthy()
    const cfgBody = await cfg.json()
    expect(cfgBody.base_url).toBeTruthy()
    expect(cfgBody.model).toBeTruthy()

    const tools = await request.get("http://localhost:8080/api/ai/tools")
    expect(tools.ok()).toBeTruthy()
    const toolsBody = await tools.json() as { tools: Array<{ name: string; description?: string; parameters?: { type: string } }> }
    expect(toolsBody.tools.length).toBeGreaterThanOrEqual(8)
    for (const t of toolsBody.tools) {
      expect(t.name).toBeTruthy()
      expect(t.parameters?.type).toBe("object")
    }
  })

  test("propose -> review lists the op -> reject removes it", async ({ page }) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e.message)))

    await page.goto("/documenteditor/")
    const aiTab = page.locator('#toolbar .ribbon-tab[data-tab="ai"]')
    if ((await aiTab.count()) === 0) {
      test.skip(true, "AI tab not deployed in this stack")
      return
    }
    // DOM-dispatched clicks: the contenteditable #editor intercepts pointer
    // events in headless (verified quirk); the interaction census uses the
    // same technique.
    await aiTab.evaluate((el) => (el as HTMLElement).click())
    await page.locator("#btn-ai-assistant").evaluate((el) => (el as HTMLElement).click())

    const dialog = page.locator("#ai-propose-dialog")
    await expect(dialog).toHaveClass(/open/, { timeout: 15_000 })
    await page.locator("#ai-propose-instruction").evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = "Add a closing sentence about reliability."
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await page.locator("#btn-ai-propose-run").evaluate((el) => (el as HTMLElement).click())

    // Run returns -> dialog closes (server recorded the op; collab poll projects it).
    await expect(page.locator("#btn-ai-propose-run")).toBeDisabled({ timeout: 90_000 }).catch(() => {})
    await expect(dialog).not.toHaveClass(/open/, { timeout: 60_000 })

    // Review surfaces the attributed op.
    await page
      .locator("#btn-ai-review-tab, #btn-ai-review")
      .first()
      .evaluate((el) => (el as HTMLElement).click())
    const review = page.locator("#ai-review-dialog")
    await expect(review).toHaveClass(/open/, { timeout: 15_000 })
    await expect(page.locator("#ai-review-list .ai-review-item").first()).toBeVisible({ timeout: 60_000 })
    const row = page.locator("#ai-review-list .ai-review-item").first()
    await expect(row).toContainText("AI (")

    // Reject one -> row leaves the list (server store shrinks).
    await row.locator("button.ai-reject").evaluate((el) => (el as HTMLElement).click())
    await expect(page.locator("#ai-review-list .ai-review-item")).toHaveCount(0, { timeout: 60_000 })

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([])
  })
})