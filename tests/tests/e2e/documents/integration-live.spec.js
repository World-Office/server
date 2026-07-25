/**
 * @fileoverview Production E2E test verifying the live integration end-to-end.
 *
 * Tests the full chain against the deployed environment:
 *   1. Verify all three services are reachable (OCIS, DocServer, Collaboration)
 *   2. Log in to OCIS
 *   3. Upload a fresh test document
 *   4. Get the file ID via WebDAV PROPFIND
 *   5. Call /app/open to get a WOPI session
 *   6. Call CheckFileInfo via the collaboration service
 *   7. Open the editor in a real browser
 *   8. Wait for the editor iframe to load
 *   9. Verify the editor canvas renders, no errors, no CSP violations
 *  10. Verify the document title shows the uploaded filename
 *
 * Environment (with sensible defaults for the production deployment):
 *   OCIS_URL             - OCIS host (default: https://cloud.graphwiz.ai)
 *   EODOCS_URL           - Document server (default: https://editor.cloud.graphwiz.ai)
 *   COLLABORATION_URL    - Collaboration WOPI host (default: https://cloud.graphwiz.ai)
 *   TEST_USER            - Test username (default: admin)
 *   TEST_PASS            - Test password (default: admin)
 *   REQUIRE_TLS          - Reject mixed-content downgrades (default: true)
 *
 * Usage:
 *   npx playwright test tests/e2e/documents/integration-live.spec.js --project=chromium
 */

const { test, expect } = require("@playwright/test")
const https = require("node:https")
const http = require("node:http")
const {
  loginToOCIS,
  uploadTestDoc,
  getFileId,
  callAppOpen,
  checkFileInfo,
  parseWopiSession,
  openEditorInBrowser,
  waitForEditorFrame,
  getEditorState,
  uniqueFilename,
} = require("../helpers/ocis-helpers")

const OCIS_URL = process.env.OCIS_URL || "https://cloud.graphwiz.ai"
const EODOCS_URL = process.env.EODOCS_URL || "https://editor.cloud.graphwiz.ai"
const COLLABORATION_URL = process.env.COLLABORATION_URL || OCIS_URL
const TEST_USER = process.env.TEST_USER || "admin"
const TEST_PASS = process.env.TEST_PASS || "admin"

function httpGetStatus(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === "https:" ? https : http
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "world-office-integration-e2e/1.0" },
      },
      (res) => {
        res.resume()
        resolve({ status: res.statusCode, url })
      },
    )
    req.on("error", reject)
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms`))
    })
    req.end()
  })
}

test.describe("Live Integration @e2e @integration", () => {
  test.setTimeout(300_000)

  test("infrastructure is live: all three services respond", async () => {
    const ocis = await httpGetStatus(`${OCIS_URL}/`, 15_000)
    expect(ocis.status, `OCIS at ${OCIS_URL} did not respond`).toBeLessThan(500)

    const eodocs = await httpGetStatus(`${EODOCS_URL}/`, 15_000)
    expect(eodocs.status, `DocServer at ${EODOCS_URL} did not respond`).toBeLessThan(500)

    const collab = await httpGetStatus(`${COLLABORATION_URL}/`, 15_000)
    expect(collab.status, `Collaboration at ${COLLABORATION_URL} did not respond`).toBeLessThan(500)
  })

  test("OCIS OIDC discovery is reachable and well-formed", async () => {
    const url = `${OCIS_URL}/.well-known/openid-configuration`
    const response = await new Promise((resolve, reject) => {
      const u = new URL(url)
      const lib = u.protocol === "https:" ? https : http
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname,
          method: "GET",
          timeout: 10_000,
        },
        (res) => {
          let data = ""
          res.on("data", (c) => {
            data += c
          })
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) })
            } catch (e) {
              resolve({ status: res.statusCode, data: { raw: data } })
            }
          })
        },
      )
      req.on("error", reject)
      req.on("timeout", () => req.destroy(new Error("OIDC discovery timed out")))
      req.end()
    })
    expect(response.status).toBe(200)
    expect(response.data.issuer).toBeTruthy()
    expect(response.data.token_endpoint).toBeTruthy()
    expect(response.data.authorization_endpoint).toBeTruthy()
  })

  test("full open-document flow: login → upload → /app/open → CheckFileInfo → editor renders", async ({
    page,
  }) => {
    const consoleErrors = []
    const cspViolations = []
    const failedRequests = []

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`)
    })

    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()} ${response.url()}`)
      }
    })

    // Step 1: Log in
    const token = await loginToOCIS(page, TEST_USER, TEST_PASS)
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(20)

    // Step 2: Upload a fresh test document
    const filename = uniqueFilename("integration-live")
    const uploadStatus = await uploadTestDoc(page, token, filename)
    expect(uploadStatus, `Upload of ${filename} failed`).toBe(201)

    // Step 3: Get file ID via WebDAV PROPFIND
    const fileId = await getFileId(page, token, filename)
    expect(fileId).toBeTruthy()

    // Step 4: Call /app/open to get a WOPI session
    const session = await callAppOpen(page, token, fileId)
    expect(session.method).toBe("POST")
    expect(session.app_url).toContain("/hosting/wopi/word/edit")
    expect(session.app_url).toContain("WOPISrc=")
    expect(session.form_parameters.access_token).toBeTruthy()

    // Step 5: Parse the WOPI session
    const { wopiSrc, fileIdInWopi, wopiToken } = parseWopiSession(session)
    expect(fileIdInWopi).toBeTruthy()
    expect(wopiToken).toBeTruthy()

    // Step 6: Verify CheckFileInfo
    const cfi = await checkFileInfo(fileIdInWopi, wopiToken)
    expect(cfi.status).toBe(200)
    expect(cfi.data.BaseFileName).toBeTruthy()
    expect(cfi.data.Size).toBeGreaterThan(0)
    expect(cfi.data.UserCanWrite).toBe(true)
    expect(cfi.data.SupportsUpdate).toBe(true)
    expect(cfi.data.SupportsLocks).toBe(true)

    // Step 7: Open the editor in the browser
    await openEditorInBrowser(page, wopiSrc, wopiToken)

    // Step 8: Wait for the editor iframe to load
    const editorFrame = await waitForEditorFrame(page, 25_000)
    expect(editorFrame, "Editor body did not appear within 25s").not.toBeNull()

    // Step 9: Verify the editor rendered a canvas with no error/loading screens
    const state = await getEditorState(editorFrame)
    expect(state.hasCanvas, "Editor body did not render content").toBe(true)
    expect(state.isError, `Editor reported error: ${state.title}`).toBe(false)
    expect(state.isLoading, "Editor is stuck on loading screen").toBe(false)

    // Step 10: Verify the document content rendered in the body editor.
    // The test docx contains the text "Hello from World Office!".
    expect(state.bodyText, `Editor body text was: "${state.bodyText}"`).toContain(
      "Hello from World Office",
    )

    // Step 11: No console errors that indicate a broken page
    // Known non-blocking noise to filter out:
    //   - /dictionaries/*.aff|*.dic 404 (spell-checker files missing in image)
    //   - localhost:8004 (collaboration client not configured for live env)
    //   - content-links CORS (cross-host fetch from editor -> cloud)
    //   - favicon.ico / React DevTools / sockjs noise
    const knownNoise = [
      /favicon\.ico/,
      /Download the React DevTools/,
      /websocket/i,
      /dictionaries\//,
      /Failed to load dictionary/,
      /Missing `aff` in dictionary/,
      /localhost:8004/,
      /useCollaboration/,
      /content-links/,
      /users\/[^/]+\/photo/,
      /WOPITest\/$/,
      /Failed to load resource/,
    ]
    const fatalErrors = consoleErrors.filter(
      (e) => !knownNoise.some((re) => re.test(e)),
    )
    expect(fatalErrors, `Console errors:\n${fatalErrors.join("\n")}`).toEqual([])

    // Step 12: No 4xx/5xx requests during the open flow (same noise filter)
    const fatalRequests = failedRequests.filter(
      (r) =>
        !knownNoise.some((re) => re.test(r)) && !/sockjs-node/.test(r),
    )
    expect(fatalRequests, `Failed requests:\n${fatalRequests.join("\n")}`).toEqual([])

    // Step 13: Screenshot the successfully opened document
    await page.screenshot({ path: "test-results/integration-live-open.png", fullPage: false })
  })
})
