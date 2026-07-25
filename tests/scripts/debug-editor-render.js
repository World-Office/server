// Debug the editor render flow: POST to /hosting/wopi/word/edit, follow redirect,
// wait for React SPA to mount, report DOM state every 2s for 30s.
//
// Run with:
//   cd server/tests && OCIS_URL=https://cloud.graphwiz.ai EODOCS_URL=https://editor.cloud.graphwiz.ai \
//     TEST_USER=admin TEST_PASS=wo-od-2026 xvfb-run node scripts/debug-editor-render.js

const { chromium } = require("playwright")
const helpers = require("../tests/e2e/helpers/ocis-helpers")

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  page.on("pageerror", (e) => console.log("[pageerror]", e.message))
  page.on("console", (msg) => {
    const t = msg.type()
    if (t === "error" || t === "warning") {
      console.log("[console." + t + "]", msg.text().substring(0, 200))
    }
  })
  page.on("requestfailed", (r) => {
    const u = r.url()
    if (!/favicon|sockjs/.test(u)) console.log("[reqfail]", u.substring(0, 140), "-", r.failure()?.errorText)
  })
  // Log ALL requests to editor host (success + fail) so we see what the SPA is doing
  page.on("response", (r) => {
    const u = r.url()
    if (u.includes("editor.cloud.graphwiz.ai") && !/\.js$|\.css$|\.woff|\.png|\.svg|favicon/.test(u)) {
      console.log("[rsp " + r.status() + "]", u.substring(0, 180))
    }
  })

  console.log("[1] login")
  const token = await helpers.loginToOCIS(page, "admin", "wo-od-2026")
  console.log("    token len:", token.length)

  console.log("[2] upload")
  const filename = helpers.uniqueFilename("debug-render")
  const st = await helpers.uploadTestDoc(page, token, filename)
  console.log("    status:", st)

  console.log("[3] getFileId")
  const fileId = await helpers.getFileId(page, token, filename)
  console.log("    fileId:", fileId)

  console.log("[4] callAppOpen")
  const session = await helpers.callAppOpen(page, token, fileId)
  console.log("    app_url:", session.app_url.substring(0, 120))

  const { wopiSrc, fileIdInWopi, wopiToken } = helpers.parseWopiSession(session)

  console.log("[5] POST to editor endpoint via form")
  const editorUrl = session.app_url
  const formHtml = `
    <html><body>
      <form id="f" method="POST" action="${editorUrl}">
        <input type="hidden" name="access_token" value="${wopiToken}" />
      </form>
      <script>document.getElementById('f').submit();</script>
    </body></html>`

  // Critical: setContent + waitForNavigation together
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) =>
      console.log("    nav error:", e.message),
    ),
    page.setContent(formHtml),
  ])
  console.log("    after nav, url:", page.url())

  console.log("[6] poll DOM every 2s for 30s")
  for (let i = 1; i <= 15; i++) {
    await page.waitForTimeout(2000)
    const state = await page.evaluate(() => {
      const pms = Array.from(document.querySelectorAll(".ProseMirror"))
      const pmInfo = pms.map((el, i) => ({
        idx: i,
        text: (el.innerText || "").substring(0, 100),
        parent: el.closest("[data-header-footer-region]")?.getAttribute("data-header-footer-region") || "body",
      }))
      return {
        url: location.href,
        title: document.title,
        hasRoot: !!document.querySelector("#root"),
        rootChildCount: document.querySelector("#root")?.childElementCount ?? 0,
        pmCount: pms.length,
        pmInfo,
        hasErrorPage: !!document.querySelector(".error-page"),
        hasLoadingPage: !!document.querySelector(".loading-page"),
        bodyText: (document.body.innerText || "").substring(0, 200),
      }
    })
    console.log(
      `  t=${i * 2}s root=${state.hasRoot}(${state.rootChildCount}ch) pm=${state.pmCount} ` +
        `err=${state.hasErrorPage} load=${state.hasLoadingPage}`,
    )
    for (const pi of state.pmInfo) {
      console.log(`     pm[${pi.idx}] (${pi.parent}): "${pi.text}"`)
    }
  }

  // Final screenshot
  await page.screenshot({ path: "test-results/debug-editor-render.png", fullPage: true })
  console.log("[7] screenshot saved to test-results/debug-editor-render.png")

  // Dump #root HTML for debugging
  const rootHtml = await page.evaluate(() => document.querySelector("#root")?.innerHTML?.substring(0, 800) ?? "(no #root)")
  console.log("[8] #root HTML:\n", rootHtml)
  const bodyText = await page.evaluate(() => document.body.innerText?.substring(0, 400) ?? "(empty)")
  console.log("[9] body text:\n", bodyText)
  const pmHtml = await page.evaluate(
    () => document.querySelector(".ProseMirror")?.innerHTML?.substring(0, 800) ?? "(no ProseMirror)",
  )
  console.log("[10] .ProseMirror HTML:\n", pmHtml)
  const docAreaText = await page.evaluate(() => {
    // try several common editor content selectors
    const sels = [
      ".ProseMirror",
      '[data-testid="document-editor"]',
      '[contenteditable="true"]',
      ".wo-document-content",
      ".document-editor",
      "main",
    ]
    for (const s of sels) {
      const el = document.querySelector(s)
      if (el) return { sel: s, text: el.innerText?.substring(0, 200) ?? "" }
    }
    return null
  })
  console.log("[11] doc area:", JSON.stringify(docAreaText))

  await browser.close()
})().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
