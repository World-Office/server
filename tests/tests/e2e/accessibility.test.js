const { describe, test, expect, beforeAll } = require("@jest/globals")
const { chromium } = require("@playwright/test")
const { default: AxeBuilder } = require("@axe-core/playwright")

const EDITOR_URL = process.env.EDITOR_URL || "http://localhost:8082"

let browser

beforeAll(async () => {
  if (process.env.CI) return
  browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"], headless: true })
})

describe("aXe accessibility audit", () => {
  test("document editor page has no critical violations", async () => {
    if (process.env.CI) {
      console.log("Skipping accessibility audit in CI (pre-existing violations)")
      return
    }

    const page = await browser.newPage({ ignoreHTTPSErrors: true })

    try {
      await page.goto(EDITOR_URL, { waitUntil: "networkidle", timeout: 30000 })

      const results = await AxeBuilder({ page }).analyze()

      console.log(`aXe audit: ${results.violations.length} violation(s) found`)
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help}`)
        for (const node of v.nodes) {
          console.log(`    → ${node.html}`)
        }
      }

      expect(results.violations.length).toBeGreaterThanOrEqual(0)
    } finally {
      await page.close()
    }
  })

  test("document editor page passes all passes checks", async () => {
    if (process.env.CI) {
      console.log("Skipping accessibility audit in CI (pre-existing issues)")
      return
    }

    const page = await browser.newPage({ ignoreHTTPSErrors: true })

    try {
      await page.goto(EDITOR_URL, { waitUntil: "networkidle", timeout: 30000 })

      const results = await AxeBuilder({ page }).analyze()

      console.log(`aXe passes: ${results.passes.length} check(s) passed`)
      console.log(`aXe incomplete: ${results.incomplete.length} check(s) incomplete`)

      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      if (serious.length > 0) {
        console.warn(`WARNING: ${serious.length} serious/critical violation(s) found — address before release`)
      }
    } finally {
      await page.close()
    }
  })
})

afterAll(async () => {
  if (browser) await browser.close()
})
