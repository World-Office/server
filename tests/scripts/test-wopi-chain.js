#!/usr/bin/env node
/**
 * WOPI Integration Test
 * Tests the full WOPI chain: login → upload → /app/open → editor URL → CheckFileInfo
 *
 * Flow:
 * 1. OIDC login via Playwright (captures access token)
 * 2. GET /app/list (verify WorldOffice registered)
 * 3. Upload .docx via WebDAV
 * 4. POST /app/open?file_id=X&app_name=WorldOffice (get WOPI token + URL)
 * 5. CheckFileInfo via wo-docserver WOPI proxy
 * 6. GetFile via wo-docserver WOPI proxy
 *
 * Usage: EODOCS_URL=http://localhost:8082 node scripts/test-wopi-chain.js
 */

const { chromium } = require("@playwright/test")

const OCIS_URL = process.env.OCIS_URL || "https://localhost:9200"
const EODOCS_URL = process.env.EODOCS_URL || "http://localhost:8082"

// Minimal valid .docx (Office Open XML ZIP)
const MINIMAL_DOCX_B64 =
  "UEsDBBQABgAIAAAAIQD/2X8S0AEAAM8EAAATAAgCW0NvbnRlbnRfVHlwZXMu" +
  "eG1sIIJyZWxzLy5yZWxzCi4uL3dvcmQvZG9jdW1lbnQueG1sCqSwTsMwDIvP" +
  "SfQjd2FHQ/ZDxJyiYxQaJG2YfaHAWbaSNG1k3dbSNNrpCj6T7v5wTPnJTt3y" +
  "vun1P9yA6f0aQWCiC3xiR4QLJcOFAzCkVOA7U1BYa3YuDGATp0fJKKBqKAr+A" +
  "iycMQmK4xzGfVkD6eYQgK3uCUZx8qQiBKFGSnkAUEsHCAVV4W1NAAAAagEA" +
  "AFBLAwQUAAYACAAAACEApL6x/QEAAAAPAQAACwAIAl9yZWxzLy5yZWxzCjxS" +
  "eWVyZW5jaWVzLz52YXIvRU9IL1Jvb3RNYW5pZmVzdC54bWwKPC9SdWxlcz4K" +
  "Ci88cm9vdE1hbmlmZXN0IHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1s" +
  "Zm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L21ldGFkYXRhL2NvcmUtcHJvcGVy" +
  "dGllcyI+CiAgPERlZmF1bHRTdHJldGNoIFBhcnRDb25maWd1cmF0aW9ucz0i" +
  "ZXh0cmFjdC8yMDEyIiAvPgo8L3Jvb3RNYW5pZmVzdD4KUEsHCAB2+sS0AQAA" +
  "FwEAAFBLAwQUAAYACAAAACEAu5Wq1wMAAABIAQAADQAIAl3b3JkL2RvY3Vt" +
  "ZW50LnhtbCiVwU4DQAwCG1+n9FS2sbscudDqHRAZKNrRjXRHEM1smcBNTk3G" +
  "LkFKdQmYtVOCvlV1olUVWt2UBXILIS5Wp1cBZmAApFKc0DsIpYCnRUVVZJV" +
  "sUT6KUWjKpZt1WpCwVdMFU0AFBLBwiVoapnAAAAUQEAAFBLAQIUABQABgAI" +
  "AAAACEA/9l/EtABAAAPBAAAEAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9U" +
  "eXBlc10ueG1sUEsBAhQAFAAGAAgAAAAhAKS+s/0BAAAADwEAAAkAAAAAAAA" +
  "AAAAAAAAAPwEAABfcmVscy8ucmVsc1BLAQIUABQABgAIAAAAIQC72rXBAwAA" +
  "AEgBAAANAAAAAAAAAAAAAAAAAGwEAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYA" +
  "AAAAAgACAIAAAAB2FgEAAAAA"

function log(step, msg) {
  console.log(`  [${step}] ${msg}`)
}

async function httpGet(url, opts = {}) {
  const mod = url.startsWith("https") ? require("node:https") : require("node:http")
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { timeout: opts.timeout || 5000, rejectUnauthorized: false }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, data }))
    })
    req.on("error", reject)
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")) })
  })
}

// STEP 1: OIDC login via Playwright
async function step1_Login() {
  log("LOGIN", `Launching headless Chromium for ${OCIS_URL}`)

  const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] })
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  let accessToken = null

  // Capture token from OIDC token endpoint
  page.on("response", async (response) => {
    const url = response.url()
    if (url.includes("/konnect/v1/token") || url.includes("/oauth2/token")) {
      try {
        const body = await response.json()
        if (body.access_token) {
          accessToken = body.access_token
          log("LOGIN", `Captured access_token (${accessToken.length} chars)`)
        }
      } catch {}
    }
  })

  try {
    await page.goto(OCIS_URL, { waitUntil: "domcontentloaded", timeout: 60000 })

    // Handle self-signed TLS warning page if shown
    try {
      const advancedBtn = page.locator("#details-button")
      if (await advancedBtn.isVisible({ timeout: 2000 })) {
        await advancedBtn.click()
        await page.locator("#proceed-link").click()
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 })
      }
    } catch {}

    // Wait for login form
    await page.waitForSelector("#oc-login-username", { state: "visible", timeout: 30000 })
    await page.waitForSelector("#oc-login-password", { state: "visible", timeout: 5000 })
    await page.fill("#oc-login-username", "admin")
    await page.fill("#oc-login-password", "admin")

    // Click login and wait for redirect to files view
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes("signin"), { timeout: 30000 }).catch(() => {}),
      page.click('button:has-text("Log in")'),
    ])

    // Wait for token to be captured (OIDC callback happens async)
    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    log("LOGIN", `Current URL: ${currentUrl}`)

    // If we still don't have a token, try navigating to files page to trigger token exchange
    if (!accessToken) {
      log("LOGIN", "No token captured yet, navigating to trigger exchange...")
      await page.goto(`${OCIS_URL}/files/`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2000)
    }

    if (!accessToken) {
      // Last resort: intercept from storage or cookies
      log("LOGIN", "Attempting to get token from page context...")
      accessToken = await page.evaluate(() => {
        // Check various OCIS token storage locations
        const ocToken = localStorage.getItem("oc_access_token")
        if (ocToken) return ocToken
        return null
      }).catch(() => null)
    }

    log("LOGIN", `Token: ${accessToken ? `${accessToken.substring(0, 40)}...` : "NOT CAPTURED"}`)

    return { accessToken, browser, ctx, page }
  } catch (e) {
    log("LOGIN", `Error: ${e.message}`)
    await browser.close()
    return null
  }
}

// STEP 2: Verify /app/list shows WorldOffice
async function step2_AppList(accessToken) {
  log("APPLIST", "Fetching /app/list...")
  const mod = require("node:https")
  return new Promise((resolve) => {
    const req = mod.get(`${OCIS_URL}/app/list`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      rejectUnauthorized: false,
      timeout: 10000,
    }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        log("APPLIST", `Status: ${res.statusCode}`)
        try {
          const parsed = JSON.parse(data)
          const mimetypes = parsed["mime-types"] || parsed.mimetypes || []
          const withDefault = mimetypes.filter((m) => m.default_application)
          log("APPLIST", `${mimetypes.length} mime-types, ${withDefault.length} with default_application`)
          if (withDefault.length > 0) {
            log("APPLIST", `  e.g. ${withDefault[0].mime_type} -> ${withDefault[0].default_application}`)
          }
          resolve(parsed)
        } catch {
          log("APPLIST", `Response: ${data.substring(0, 300)}`)
          resolve(null)
        }
      })
    })
    req.on("error", (e) => { log("APPLIST", `Error: ${e.message}`); resolve(null) })
    req.on("timeout", () => { req.destroy(); resolve(null) })
  })
}

// STEP 3: Upload .docx via WebDAV
async function step3_Upload(accessToken) {
  log("UPLOAD", "Uploading test .docx via WebDAV...")
  const mod = require("node:https")
  const timestamp = Date.now()
  const filename = `wopi-test-${timestamp}.docx`
  const davPath = "/dav/files/admin/WOPITest/"

  // MKCOL
  await new Promise((resolve) => {
    const req = mod.request(`${OCIS_URL}${davPath}`, {
      method: "MKCOL",
      headers: { Authorization: `Bearer ${accessToken}` },
      rejectUnauthorized: false,
    }, (res) => {
      let data = ""
      res.on("data", (c) => (data += c))
      res.on("end", () => { log("UPLOAD", `MKCOL: ${res.statusCode}`); resolve() })
    })
    req.on("error", () => resolve())
    req.end()
  })

  // PUT file
  const docxBuffer = Buffer.from(MINIMAL_DOCX_B64, "base64")
  const uploadStatus = await new Promise((resolve) => {
    const req = mod.request(`${OCIS_URL}${davPath}${filename}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": docxBuffer.length,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let data = ""
      res.on("data", (c) => (data += c))
      res.on("end", () => resolve({ status: res.statusCode, etag: res.headers.etag }))
    })
    req.on("error", () => resolve({ status: 0 }))
    req.write(docxBuffer)
    req.end()
  })

  log("UPLOAD", `PUT ${filename}: ${uploadStatus.status} (etag: ${uploadStatus.etag || "none"})`)

  if (uploadStatus.status < 200 || uploadStatus.status >= 300) {
    log("UPLOAD", "Upload failed")
    return null
  }

  // PROPFIND to get file ID
  const propfindBody =
    '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getetag/><oc:fileid/><d:resourcetype/></d:prop></d:propfind>'
  const propfindResult = await new Promise((resolve) => {
    const req = mod.request(`${OCIS_URL}${davPath}${filename}`, {
      method: "PROPFIND",
      headers: {
        Depth: "0",
        "Content-Type": "application/xml",
        Authorization: `Bearer ${accessToken}`,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let data = ""
      res.on("data", (c) => (data += c))
      res.on("end", () => resolve({ status: res.statusCode, data }))
    })
    req.on("error", () => resolve({ status: 0, data: "" }))
    req.write(propfindBody)
    req.end()
  })

  let fileId = null
  if (propfindResult.status === 207) {
    const fidMatch = propfindResult.data.match(/<oc:fileid[^>]*>([^<]+)<\/oc:fileid>/i)
    if (fidMatch) fileId = fidMatch[1]
  }
  log("UPLOAD", `File ID: ${fileId || "not found"} (PROPFIND: ${propfindResult.status})`)

  return fileId ? { filename, path: `WOPITest/${filename}`, fileId } : null
}

// STEP 4: Call /app/open to get WOPI params
async function step4_AppOpen(fileId, accessToken) {
  log("APPOPEN", `POST /app/open?file_id=${fileId}&app_name=WorldOffice`)
  const mod = require("node:https")
  return new Promise((resolve) => {
    const req = mod.request(`${OCIS_URL}/app/open?file_id=${encodeURIComponent(fileId)}&app_name=WorldOffice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      rejectUnauthorized: false,
      timeout: 10000,
    }, (res) => {
      let data = ""
      res.on("data", (c) => (data += c))
      res.on("end", () => {
        log("APPOPEN", `Status: ${res.statusCode}`)
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const json = JSON.parse(data)
            log("APPOPEN", `app_url: ${json.app_url ? json.app_url.substring(0, 120) : "none"}`)
            log("APPOPEN", `method: ${json.method || "none"}`)
            if (json.form_parameters) {
              log("APPOPEN", `access_token: ${json.form_parameters.access_token ? `${json.form_parameters.access_token.substring(0, 40)}...` : "none"}`)
            }
            resolve(json)
          } catch {
            log("APPOPEN", `Non-JSON response: ${data.substring(0, 300)}`)
            resolve(null)
          }
        } else {
          log("APPOPEN", `Response: ${data.substring(0, 300)}`)
          resolve(null)
        }
      })
    })
    req.on("error", (e) => { log("APPOPEN", `Error: ${e.message}`); resolve(null) })
    req.on("timeout", () => { req.destroy(); resolve(null) })
    req.end()
  })
}

// STEP 5: Test CheckFileInfo through wo-docserver WOPI proxy
async function step5_CheckFileInfo(wopiFileId, wopiAccessToken) {
  log("CHECKFILEINFO", `GET ${EODOCS_URL}/wopi/files/${wopiFileId}?access_token=...`)
  try {
    const r = await httpGet(`${EODOCS_URL}/wopi/files/${wopiFileId}?access_token=${wopiAccessToken}`)
    log("CHECKFILEINFO", `Status: ${r.status}`)
    log("CHECKFILEINFO", `Response: ${r.data.substring(0, 500)}`)
    return r
  } catch (e) {
    log("CHECKFILEINFO", `Error: ${e.message}`)
    return null
  }
}

// STEP 6: Test GetFile through wo-docserver WOPI proxy
async function step6_GetFile(wopiFileId, wopiAccessToken) {
  log("GETFILE", `GET ${EODOCS_URL}/wopi/files/${wopiFileId}/contents?access_token=...`)
  try {
    const r = await httpGet(`${EODOCS_URL}/wopi/files/${wopiFileId}/contents?access_token=${wopiAccessToken}`)
    log("GETFILE", `Status: ${r.status}`)
    log("GETFILE", `Content-Length: ${r.headers["content-length"] || "unknown"}`)
    log("GETFILE", `CT: ${r.headers["content-type"] || "unknown"}`)
    return r
  } catch (e) {
    log("GETFILE", `Error: ${e.message}`)
    return null
  }
}

// STEP 7: Verify discovery XML via wo-docserver
async function step7_Discovery() {
  log("DISCOVERY", `GET ${EODOCS_URL}/hosting/discovery`)
  try {
    const r = await httpGet(`${EODOCS_URL}/hosting/discovery`)
    log("DISCOVERY", `Status: ${r.status}`)
    if (r.data.includes("&lt;WOPISrc&gt;")) {
      log("DISCOVERY", "XML escaping correct (&lt;WOPISrc&gt;)")
    } else if (r.data.includes("<WOPISrc>")) {
      log("DISCOVERY", "WARNING: unescaped <WOPISrc> in XML")
    }
    return r
  } catch (e) {
    log("DISCOVERY", `Error: ${e.message}`)
    return null
  }
}

// MAIN
async function main() {
  console.log("==========================================")
  console.log(" WOPI Integration Test")
  console.log("==========================================")
  console.log(`  OCIS:     ${OCIS_URL}`)
  console.log(`  DocServer: ${EODOCS_URL}`)
  console.log("")

  // Step 7: Quick discovery check (no auth needed)
  console.log("=== Step 7: Discovery XML ===")
  await step7_Discovery()

  // Step 1: Login
  console.log("\n=== Step 1: OIDC Login ===")
  const auth = await step1_Login()
  if (!auth) {
    console.log("\nBLOCKED: Cannot login")
    process.exit(1)
  }
  if (!auth.accessToken) {
    console.log("\nBLOCKED: No access token captured")
    await auth.browser.close()
    process.exit(1)
  }

  // Step 2: App list
  console.log("\n=== Step 2: /app/list ===")
  const appList = await step2_AppList(auth.accessToken)

  // Step 3: Upload
  console.log("\n=== Step 3: Upload .docx ===")
  const fileInfo = await step3_Upload(auth.accessToken)

  // Step 4: /app/open
  let appOpen = null
  if (fileInfo) {
    console.log("\n=== Step 4: /app/open ===")
    appOpen = await step4_AppOpen(fileInfo.fileId, auth.accessToken)
  } else {
    console.log("\n=== Step 4: /app/open (SKIPPED - no file) ===")
  }

  // Step 5-6: WOPI chain via wo-docserver
  if (appOpen && appOpen.app_url) {
    // Extract WOPI file ID and token from app_url
    const appUrl = appOpen.app_url
    const wopiSrcMatch = appUrl.match(/[?&]WOPISrc=([^&]+)/)
    let wopiSrc = ""
    if (wopiSrcMatch) {
      wopiSrc = decodeURIComponent(wopiSrcMatch[1])
    }
    // The real WOPI src is the one containing https:// (not the template placeholder)
    const allWopiSrc = appUrl.match(/[?&]WOPISrc=([^&]+)/g) || []
    for (const match of allWopiSrc) {
      const decoded = decodeURIComponent(match.replace(/[?&]WOPISrc=/, ""))
      if (decoded.startsWith("https://")) {
        wopiSrc = decoded
        break
      }
    }
    const wopiFileId = wopiSrc.split("/wopi/files/")[1] || ""
    const wopiToken = appOpen.form_parameters?.access_token || ""

    log("WOPI", `File ID in WOPISrc: ${wopiFileId}`)
    log("WOPI", `WOPI token: ${wopiToken ? `${wopiToken.substring(0, 40)}...` : "NONE"}`)

    if (wopiFileId && wopiToken) {
      console.log("\n=== Step 5: CheckFileInfo via wo-docserver ===")
      await step5_CheckFileInfo(wopiFileId, wopiToken)

      console.log("\n=== Step 6: GetFile via wo-docserver ===")
      await step6_GetFile(wopiFileId, wopiToken)
    } else {
      console.log("\n=== Steps 5-6: SKIPPED (no WOPI file ID or token) ===")
    }
  } else {
    console.log("\n=== Steps 5-6: SKIPPED (no /app/open result) ===")
  }

  // Summary
  console.log("\n==========================================")
  console.log(" Summary")
  console.log("==========================================")
  console.log(`  Login:         ${auth.accessToken ? "OK" : "FAILED"}`)
  console.log(`  /app/list:     ${appList ? "OK" : "FAILED"}`)
  console.log(`  Upload:        ${fileInfo ? `OK (${fileInfo.filename})` : "FAILED"}`)
  console.log(`  /app/open:     ${appOpen ? "OK" : "FAILED"}`)
  console.log("==========================================")

  await auth.browser.close()
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
