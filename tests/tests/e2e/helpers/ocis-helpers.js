/**
 * @fileoverview Shared helpers for OCIS + World Office WOPI integration tests.
 *
 * All patterns are proven against the running test environment:
 * - OCIS at https://localhost:9200
 * - Collaboration service at http://localhost:9300
 * - World Office Document Server at http://localhost:8082
 * - nginx proxy at http://localhost:8083
 */

const https = require("node:https")
const fs = require("node:fs")
const path = require("node:path")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OCIS_URL = process.env.OCIS_URL || "https://localhost:9200"
// Collaboration WOPI endpoints are exposed through the same reverse proxy as
// OCIS itself (https://cloud.graphwiz.ai/wopi/files/... → collaboration:9300).
// Default to OCIS_URL when COLLABORATION_URL is not explicitly set.
const COLLABORATION_URL = process.env.COLLABORATION_URL || OCIS_URL
const EODOCS_URL = process.env.EODOCS_URL || "http://localhost:8082"
const TEST_USER = process.env.TEST_USER || "admin"
const TEST_PASS = process.env.TEST_PASS || "admin"

// CSS selector that uniquely matches the BODY ProseMirror editor in the
// documenteditor-react SPA, excluding header/footer editors (which live inside
// <div data-header-footer-region="...">). RichTextEditor wraps TipTap in
// <div class="rich-text-editor"> and DocumentHolder wraps that in
// <div class="de-document-holder">. Either ancestor uniquely identifies body.
const EDITOR_BODY_SELECTOR = ".de-document-holder .ProseMirror, .rich-text-editor .ProseMirror"

const LOGIN = {
  username: "#oc-login-username",
  password: "#oc-login-password",
  submit: 'button:has-text("Log in")',
}

/** Minimal valid OOXML .docx as base64 (contains "Hello from World Office!") */
const MINIMAL_DOCX_B64 =
  "UEsDBBQAAAAIAO9h+VzXeYTq8QAAALgBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE730Ky9cqccoBIZSkB36OwKE8wMreJFb9J69b2rdn00KREOVozXwz62nXB+/EHjPZGDq5qhspMOhobBg7+b55ru6koALBgIsBO3lEkut+0W6OCUkwHKiTUynpXinSE3qgOiYMrAwxeyj8zKNKoLcworppmlulYygYSlXmDNkvhGgfcYCdK+LpwMr5loyOpHg4e+e6TkJKzmoorKt9ML+Kqq+SmsmThyabaMkGqa6VzOL1jh/0lSfK1qB4g1xewLNRfcRslIl65xmu/0/649o4DFbjhZ/TUo4aiXh77+qL4sGG71+06jR8/wlQSwMEFAAAAAgA72H5XCAbhuqyAAAALgEAAAsAAABfcmVscy8ucmVsc43Puw6CMBQG4J2naM4uBQdjDIXFmLAafICmPZRGeklbL7y9HRzEODie23fyN93TzOSOIWpnGdRlBQStcFJbxeAynDZ7IDFxK/nsLDJYMELXFs0ZZ57yTZy0jyQjNjKYUvIHSqOY0PBYOo82T0YXDE+5DIp6Lq5cId1W1Y6GTwPagpAVS3rJIPSyBjIsHv/h3ThqgUcnbgZt+vHlayPLPChMDB4uSCrf7TKzQHNKuorZvgBQSwMEFAAAAAgA72H5XFUH2HrvAAAAbQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbEVQy07DMBC89yuM79RpVFAVJekNcUEgAeLs2uskku217IVQvh47JfQymtnXeNwev51lXxDThL7ju23FGXiFevJDx9/fHm4PnCWSXkuLHjp+hsSP/aadG43q04Enli/41MwdH4lCI0RSIziZthjA557B6CRlGQcxY9QhooKUsoGzoq6qe+Hk5Hm/YSxfPaE+F7qI0GeIBah/BGuRmYiOfWC0mj0bMym4aUXpFowLhv/tBIpelu0wvP6wuTxxV9f7HHFuxszvDpmLy8CTjLlKGHJ9fxmJ0zDSVZ6QCN1VWzBrVyzOf34lh1iDFLZ+VP8LUEsBAhQDFAAAAAgA72H5XNd5hOrxAAAAuAEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACADvYflcIBuG6rIAAAAuAQAACwAAAAAAAAAAAAAAgAEiAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACADvYflcVQfYeu8AAABtAQAAEQAAAAAAAAAAAAAAgAH9AQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAGwMAAAAA"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Login to OCIS and return the OIDC access token.
 * Token is captured from the /konnect/v1/token response.
 */
async function loginToOCIS(page, username = TEST_USER, password = TEST_PASS) {
  let token = null
  page.on("response", async (r) => {
    if (r.url().includes("/konnect/v1/token")) {
      try {
        const b = await r.json()
        if (b.access_token) token = b.access_token
      } catch (e) {
        /* ignore parse errors */
      }
    }
  })

  await page.goto(OCIS_URL, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForSelector(LOGIN.username, { state: "visible", timeout: 30000 })
  await page.waitForSelector(LOGIN.password, { state: "visible", timeout: 5000 })
  await page.fill(LOGIN.username, username)
  await page.fill(LOGIN.password, password)
  await Promise.all([
    page.waitForURL("**/files/**", { timeout: 30000 }).catch(() => {}),
    page.click(LOGIN.submit),
  ])
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 })
  await page.waitForTimeout(3000)

  if (!token) throw new Error("Failed to capture OIDC access token after login")
  return token
}

/**
 * Ensure the WOPITest folder exists and upload a test .docx file.
 * Returns the upload status code.
 */
async function uploadTestDoc(page, token, filename) {
  // Ensure folder exists
  await page.evaluate(
    async ({ url, token }) => {
      await fetch(url, { method: "MKCOL", headers: { Authorization: `Bearer ${token}` } })
    },
    { url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/`, token },
  )

  const result = await page.evaluate(
    async ({ url, docxBase64, token }) => {
      const binary = Uint8Array.from(atob(docxBase64), (c) => c.charCodeAt(0))
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          Authorization: `Bearer ${token}`,
        },
        body: binary,
      })
      return { status: res.status }
    },
    {
      url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/${filename}`,
      docxBase64: MINIMAL_DOCX_B64,
      token,
    },
  )
  return result.status
}

/**
 * Get the OCIS file ID via WebDAV PROPFIND.
 */
async function getFileId(page, token, filename) {
  const result = await page.evaluate(
    async ({ url, token }) => {
      const body =
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>'
      const res = await fetch(url, {
        method: "PROPFIND",
        headers: {
          Depth: "0",
          "Content-Type": "application/xml",
          Authorization: `Bearer ${token}`,
        },
        body,
      })
      return { status: res.status, data: await res.text() }
    },
    { url: `${OCIS_URL}/dav/files/${TEST_USER}/WOPITest/${filename}`, token },
  )

  if (result.status !== 207) {
    throw new Error(
      `PROPFIND failed with status ${result.status}: ${result.data.substring(0, 300)}`,
    )
  }

  const match = result.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i)
  if (!match) throw new Error("Could not extract oc:fileid from PROPFIND response")
  return match[1]
}

/**
 * Call /app/open to get a WOPI editor session.
 * Returns { app_url, method, form_parameters: { access_token } }.
 */
async function callAppOpen(page, token, fileId) {
  const result = await page.evaluate(
    async ({ url, token }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      return { status: res.status, data: await res.json() }
    },
    {
      url: `${OCIS_URL}/app/open?file_id=${encodeURIComponent(fileId)}&app_name=WorldOffice`,
      token,
    },
  )

  if (result.status !== 200) {
    throw new Error(`/app/open failed with status ${result.status}: ${JSON.stringify(result.data)}`)
  }

  const session = result.data
  if (!session.app_url || !session.form_parameters?.access_token) {
    throw new Error(
      `/app/open returned invalid response: ${JSON.stringify(session).substring(0, 300)}`,
    )
  }
  return session
}

/**
 * Call CheckFileInfo on the collaboration WOPI endpoint.
 * Uses Node.js https module (NOT page.evaluate) to avoid mixed-content issues
 * when the browser page is on HTTP but OCIS is on HTTPS.
 */
async function checkFileInfo(fileIdInWopi, wopiToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/wopi/files/${fileIdInWopi}`, COLLABORATION_URL)
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}?access_token=${encodeURIComponent(wopiToken)}`,
      method: "GET",
      timeout: 15000,
    }
    const req = (url.protocol === "https:" ? https : require("node:http")).request(
      options,
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
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
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("CheckFileInfo request timed out"))
    })
    req.end()
  })
}

/**
 * Parse WOPI session to extract WOPISrc and token.
 */
function parseWopiSession(session) {
  const wopiSrc = decodeURIComponent(session.app_url.match(/WOPISrc=([^&]+)/)?.[1] || "")
  const fileIdInWopi = wopiSrc.split("/wopi/files/")[1] || ""
  const wopiToken = session.form_parameters.access_token
  return { wopiSrc, fileIdInWopi, wopiToken }
}

/**
 * Navigate the browser to the World Office editor via form POST.
 * The editor requires POST (not GET) with access_token in the form body.
 *
 * IMPORTANT: Use the ORIGINAL WOPISrc with container hostname (test-collaboration:9300).
 * eo-docs calls WOPISrc server-side from inside its container.
 */
async function openEditorInBrowser(page, wopiSrc, wopiToken) {
  const editorPostUrl = `${EODOCS_URL}/hosting/wopi/word/edit?WOPISrc=${encodeURIComponent(wopiSrc)}`
  const formHtml = `
    <html><body>
      <form id="f" method="POST" action="${editorPostUrl}">
        <input type="hidden" name="access_token" value="${wopiToken}" />
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>
  `
  // Race-free: register the navigation listener BEFORE setContent fires the
  // auto-submitting form. A sequential setContent → waitForNavigation misses
  // the navigation because the form's submit() runs during setContent.
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 })
      .catch(() => {}),
    page.setContent(formHtml),
  ])
}

/**
 * Wait for the editor to mount the body ProseMirror instance with content.
 *
 * The documenteditor-react SPA mounts THREE TipTap/ProseMirror editors:
 *   - region="header" (default placeholder text "Header")
 *   - region="body"   (the actual loaded document content)
 *   - region="footer" (default placeholder text "Footer")
 *
 * Header/Footer editors live inside <div data-header-footer-region="...">.
 * We wait specifically for the BODY editor to contain non-empty content.
 *
 * Returns the Playwright `page` (the editor renders on the main document, not in
 * an iframe). Returns null on timeout.
 */
async function waitForEditorFrame(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const editors = document.querySelectorAll(".ProseMirror")
      for (const el of editors) {
        // Skip header/footer editors (placeholders "Header" / "Footer")
        if (el.closest("[data-header-footer-region]")) continue
        if (el.textContent.trim().length > 0) return true
      }
      return false
    })
    if (ready) return page
    await page.waitForTimeout(500)
  }
  return null
}

/**
 * Get the editor state from the page.
 * `hasCanvas` is kept for API compatibility with older tests; it is true when
 * the body ProseMirror editor has rendered content.
 */
async function getEditorState(editorFrame) {
  if (!editorFrame) return { hasCanvas: false, isError: true, title: "no frame" }

  return editorFrame.evaluate(() => {
    let bodyEditor = null
    for (const el of document.querySelectorAll(".ProseMirror")) {
      if (el.closest("[data-header-footer-region]")) continue
      bodyEditor = el
      break
    }
    const bodyText = bodyEditor ? bodyEditor.textContent.trim() : ""
    return {
      hasCanvas: bodyText.length > 0,
      bodyText,
      isError:
        !!document.querySelector(".error-page") ||
        document.body.innerText.includes("Failed to load document"),
      isLoading: !!document.querySelector(".loading-page"),
      bodyClasses: document.body.className.substring(0, 100),
      title: document.title,
    }
  })
}

/**
 * Wait for the body ProseMirror editor to be present in the DOM.
 *
 * Use this in place of `frame.waitForSelector("canvas", ...)` — the
 * documenteditor-react SPA renders TipTap/ProseMirror editors, not a canvas.
 *
 * `frameOrPage` may be either a Playwright Page or Frame. Returns the locator
 * for the body editor (throws on timeout, matching `waitForSelector` semantics).
 */
async function waitForBodyEditor(frameOrPage, timeoutMs = 30000) {
  return frameOrPage.waitForSelector(EDITOR_BODY_SELECTOR, {
    timeout: timeoutMs,
    state: "visible",
  })
}

/**
 * Focus + click the body editor so subsequent keyboard input lands in it.
 *
 * Use this in place of `frame.click("canvas")`. Returns the body editor
 * locator for chaining.
 */
async function focusBodyEditor(frameOrPage) {
  const locator = await waitForBodyEditor(frameOrPage, 30000)
  await locator.click()
  return locator
}

/**
 * Generate a unique test filename.
 */
function uniqueFilename(prefix = "test") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.docx`
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  OCIS_URL,
  COLLABORATION_URL,
  EODOCS_URL,
  TEST_USER,
  TEST_PASS,
  LOGIN,
  MINIMAL_DOCX_B64,
  EDITOR_BODY_SELECTOR,
  loginToOCIS,
  uploadTestDoc,
  getFileId,
  callAppOpen,
  checkFileInfo,
  parseWopiSession,
  openEditorInBrowser,
  waitForEditorFrame,
  getEditorState,
  waitForBodyEditor,
  focusBodyEditor,
  uniqueFilename,
}
