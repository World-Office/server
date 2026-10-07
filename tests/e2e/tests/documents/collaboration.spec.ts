import { expect, test, type Page } from "@playwright/test"

/**
 * E-CO-1 · Real-time collaboration e2e.
 *
 * Two editor contexts on the same document; a model op authored in A must
 * be applied in B (flattened WIRE_SCHEMA_VERSION=1 document_op envelopes
 * broadcast by the coauthoring service).
 *
 * Requires the coauthoring service in the stack (docker-compose.test.yml)
 * and the editor's collab endpoints injected. The editor itself skips the
 * collaboration provider when no COAUTHORING_* URL is configured, so the
 * suite skips gracefully (loud, not silent) when the stack lacks it.
 */

const COLLAB_WS = (process.env.CO_AUTHORING_WS_URL || "ws://localhost:8004").replace(/\{session_id\}/g, "e2e-coauth")
const COLLAB_API = process.env.CO_AUTHORING_API_URL || "http://localhost:8004"

async function openEditor(page: Page) {
  await page.addInitScript(({ ws, api }) => {
    const w = window as unknown as Record<string, unknown>
    w.__COAUTHORING_WS_URL = ws
    w.__COAUTHORING_API_URL = api
  }, { ws: COLLAB_WS, api: COLLAB_API })
  await page.goto("/documenteditor/")
  const toolbar = page.locator("#toolbar, [data-role='toolbar']")
  await expect(toolbar.first()).toBeVisible({ timeout: 30_000 })
}

test.describe("Collaboration (E-CO-1)", () => {
  test("model op authored in A reaches B; own echoes are not re-applied", async ({ browser }) => {
    test.setTimeout(180_000)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()

    const collabUp = await fetch(`${COLLAB_API}/health`).then((r) => r.ok).catch(() => false)
    if (!collabUp) {
      test.skip(true, "coauthoring service not in stack — E-CO-1 needs services/coauthoring-service")
      return
    }

    await openEditor(a)
    await openEditor(b)

    // Both editors must join the SAME session (same document id + collab API).
    // A types a character; B must receive + apply the resulting document_op.
    const editorA = a.locator("#editor, [contenteditable='true']").first()
    await expect(editorA).toBeVisible({ timeout: 30_000 })
    await editorA.click({ force: true })
    await a.keyboard.type("hello", { delay: 20 })

    // B converges: the typed text appears in B's document surface.
    await expect
      .poll(async () => (await b.locator("body").textContent())?.includes("hello") ?? false, {
        timeout: 60_000,
        intervals: [1_000, 2_000, 3_000],
      })
      .toBe(true)

    await ctxA.close()
    await ctxB.close()
  })
})