import { expect, test } from "@playwright/test"

test.describe("Collaboration", () => {
  test("should show collaboration status indicator", async ({ page }) => {
    await page.goto("/documenteditor/")
    await expect(page.locator(".wo-collaboration-status").first()).toBeVisible({ timeout: 15_000 })
  })

  test("should show collaborator list", async ({ page }) => {
    await page.goto("/documenteditor/")
    await expect(page.locator(".wo-collaborator-list").first()).toBeVisible({ timeout: 15_000 })
  })

  test("should show comments panel via right menu", async ({ page }) => {
    await page.goto("/documenteditor/")
    await page.locator('[data-action="comments"]').click()
    await expect(page.locator(".de-comments-panel")).toBeVisible({ timeout: 10_000 })
  })

  test("should open track changes review panel with action buttons", async ({ page }) => {
    await page.goto("/documenteditor/")
    await page.locator('[data-action="review"]').click()
    const panel = page.locator(".de-track-changes-panel")
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(panel.locator(".de-track-btn-accept")).toBeVisible()
    await expect(panel.locator(".de-track-btn-reject")).toBeVisible()
  })

  test("should toggle track changes recording", async ({ page }) => {
    await page.goto("/documenteditor/")
    await page.locator('[data-action="review"]').click()
    const checkbox = page.locator('.de-track-changes-toggle input[type="checkbox"]')
    await expect(checkbox).toBeVisible({ timeout: 10_000 })
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
    await checkbox.click()
    await expect(checkbox).toBeChecked()
  })

  test("should accept all tracked changes", async ({ page }) => {
    await page.goto("/documenteditor/")
    await page.locator('[data-action="review"]').click()
    await page
      .locator(".de-track-changes-panel .de-track-btn-accept", { hasText: "Accept All" })
      .click()
    await expect(page.locator(".de-track-changes-message")).toBeVisible({ timeout: 5_000 })
  })

  test("should reject all tracked changes", async ({ page }) => {
    await page.goto("/documenteditor/")
    await page.locator('[data-action="review"]').click()
    await page
      .locator(".de-track-changes-panel .de-track-btn-reject", { hasText: "Reject All" })
      .click()
    await expect(page.locator(".de-track-changes-message")).toBeVisible({ timeout: 5_000 })
  })

  test("should show collaborator cursors layer", async ({ page }) => {
    await page.goto("/documenteditor/")
    await expect(page.locator(".wo-collaborator-cursors").first()).toBeVisible({ timeout: 15_000 })
  })
})
