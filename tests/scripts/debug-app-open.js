#!/usr/bin/env node
/**
 * Debug the /app/open endpoint with various file ID formats.
 *
 * Captures an OIDC token via Playwright login, uploads a doc, gets its ID,
 * then tries /app/open with: raw composite ID, URL-encoded, node-UUID-only,
 * space$node format, and via GET vs POST.
 */
const { chromium } = require("@playwright/test")
const {
  loginToOCIS,
  uploadTestDoc,
  getFileId,
  uniqueFilename,
  OCIS_URL,
  TEST_USER,
  TEST_PASS,
} = require("../tests/e2e/helpers/ocis-helpers")

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  console.log("[1] Logging in to capture OIDC token…")
  const token = await loginToOCIS(page, TEST_USER, TEST_PASS)
  console.log("    token len:", token.length)

  const filename = uniqueFilename("debug-appopen")
  console.log("[2] Uploading", filename)
  const st = await uploadTestDoc(page, token, filename)
  console.log("    upload status:", st)

  const fileId = await getFileId(page, token, filename)
  console.log("[3] composite fileId:", fileId)

  // Also fetch the space ID + node ID via the graph API to compare formats
  const parts = fileId.split(/[$!]/)
  console.log("    parts:", parts)
  const [spaceId, rootId, nodeId] = parts

  // Try multiple formats
  const variants = [
    { label: "raw composite (space$root!node)", id: fileId },
    { label: "encodeURIComponent composite", id: encodeURIComponent(fileId) },
    { label: "node UUID only", id: nodeId },
    { label: "space$node", id: `${spaceId}$${nodeId}` },
    { label: "space!node", id: `${spaceId}!${nodeId}` },
    { label: "root!node", id: `${rootId}!${nodeId}` },
  ]

  // Show the FULL /app/open response for the working format
  {
    const url = `${OCIS_URL}/app/open?file_id=${encodeURIComponent(fileId)}&app_name=WorldOffice`
    const res = await page.evaluate(
      async ({ url, token }) => {
        const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        return { status: res.status, body: await res.json() }
      },
      { url, token },
    )
    console.log("\n[FULL /app/open response]:")
    console.log(JSON.stringify(res, null, 2))
  }

  // Also: list spaces to understand what graph returns for the file
  console.log("\n[4] Graph: list spaces")
  const spaces = await page.evaluate(
    async ({ url, token }) => {
      const r = await fetch(`${url}/graph/v1.0/drives`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await r.json()
      return { status: r.status, value: (j.value || []).map((s) => ({ id: s.id, name: s.name, driveType: s.driveType })) }
    },
    { url: OCIS_URL, token },
  )
  console.log("    spaces:", JSON.stringify(spaces, null, 2).substring(0, 600))

  await browser.close()
})().catch((e) => {
  console.error("DEBUG FAILED:", e)
  process.exit(1)
})
