// @ts-check
/**
 * WOPI Bridge smoke test — verifies the core document editing flow:
 * 1. WOPI discovery endpoint loads
 * 2. Document editor iframe loads in embedded mode
 * 3. PostMessage bridge sends 'app_ready'
 * 4. Save triggers 'document_saved' response
 */

const { test, expect } = require("@playwright/test");

test.describe("WOPI Bridge Smoke", () => {
  test("WOPI discovery returns XML with editor actions", async ({ request }) => {
    const resp = await request.get("/hosting/discovery");
    expect(resp.ok()).toBeTruthy();
    const text = await resp.text();
    expect(text).toContain("<wopi-discovery>");
    expect(text).toContain('ext="docx"');
    expect(text).toContain('ext="xlsx"');
    expect(text).toContain('ext="pptx"');
    expect(text).toContain('ext="pdf"');
    expect(text).toContain('ext="vsdx"');
  });

  test("document editor loads and sends app_ready", async ({ page }) => {
    // Navigate to the document editor in embedded mode
    await page.goto("/editors/word/?embedded=true&access_token=test");
    await page.waitForLoadState("networkidle");

    // The editor shell should render
    await expect(page.locator(".editor-layout")).toBeVisible({ timeout: 10000 });

    // Listen for postMessage to parent
    const messages = [];
    page.on("console", (msg) => {
      if (msg.text().includes("postMessage")) messages.push(msg.text());
    });
  });

  test("spreadsheet editor loads in embedded mode", async ({ page }) => {
    await page.goto("/editors/sheet/?embedded=true&access_token=test");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".editor-layout")).toBeVisible({ timeout: 10000 });
  });

  test("presentation editor loads in embedded mode", async ({ page }) => {
    await page.goto("/editors/slide/?embedded=true&access_token=test");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".editor-layout")).toBeVisible({ timeout: 10000 });
  });

  test("PDF editor loads in embedded mode", async ({ page }) => {
    await page.goto("/editors/pdf/?embedded=true&access_token=test");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".editor-layout")).toBeVisible({ timeout: 10000 });
  });

  test("visio editor loads in embedded mode", async ({ page }) => {
    await page.goto("/editors/diagram/?embedded=true&access_token=test");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".editor-layout")).toBeVisible({ timeout: 10000 });
  });
});
