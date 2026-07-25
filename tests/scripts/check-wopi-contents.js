const { chromium } = require("playwright");
const helpers = require("../tests/e2e/helpers/ocis-helpers.js");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") console.log("[err]", m.text().substring(0,300)); });

  const token = await helpers.loginToOCIS(page, "admin", "wo-od-2026");
  const filename = `wc-${Date.now()}.docx`;
  await helpers.uploadTestDoc(page, token, filename);
  const fileId = await helpers.getFileId(page, token, filename);
  const open = await helpers.callAppOpen(page, token, fileId);

  console.log("[0] open response keys:", Object.keys(open));
  console.log("[0] app_url:", open.app_url);
  console.log("[0] has access_token:", "access_token" in open);
  console.log("[0] form_parameters:", open.form_parameters ? Object.keys(open.form_parameters) : null);
  console.log("[0] method:", open.method);

  // openEditorInBrowser builds the form HTML from app_url + form_parameters.access_token
  await helpers.openEditorInBrowser(page, open);
  await page.waitForURL(/editor\.cloud\.graphwiz\.ai\/editors\//, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Now we're on editor.cloud.graphwiz.ai — find the WOPI token from URL
  const url = page.url();
  console.log("[1] editor URL:", url.substring(0, 300));

  // Extract access_token from URL
  const m = url.match(/access_token=([^&]+)/);
  if (!m) { console.error("no access_token"); process.exit(1); }
  const wopiToken = decodeURIComponent(m[1]);

  // Extract file_id from URL
  const m2 = url.match(/file_id=([^&]+)/);
  const fileIdFromUrl = m2 ? decodeURIComponent(m2[1]) : null;
  console.log("[2] file_id from URL:", fileIdFromUrl);

  // Call /wopi/files/{id} (CheckFileInfo) and /wopi/files/{id}/contents
  const result = await page.evaluate(async ({ wopiToken }) => {
    // The body editor has data-file-id attribute set by wo-docserver.js bootstrap
    const bodyEditor = document.querySelector(".de-document-holder .ProseMirror, .rich-text-editor .ProseMirror");
    // Also check what meta/api calls are made. First check what URLs the editor knows about.
    const scripts = Array.from(document.querySelectorAll("script")).map(s => s.textContent.substring(0, 100));
    const wopiSources = scripts.filter(s => s.includes("WOPISrc") || s.includes("fileId") || s.includes("file_id"));
    
    // Try common file_id sources
    const fileIdCandidates = [
      // From URL of any in-flight requests
      ...(window.__WOPI_SRC__ || ""),
    ];

    // Make a request to a known WOPI endpoint with the wopiToken
    // First call /wopi/files/{some-id} — but we need the right ID
    // Let me intercept via fetch hook
    const out = { 
      wopiSources: wopiSources,
      bodyEditorPresent: !!bodyEditor,
      // Inspect document state
      hasWindowFileId: !!window.fileId,
      hasWindowWopiSrc: !!window.WOPISrc,
      windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('wopi') || k.toLowerCase().includes('file')).slice(0, 20),
    };

    // Hook fetch to record all WOPI calls
    if (!window.__fetchHooked) {
      window.__fetchLog = [];
      const origFetch = window.fetch;
      window.fetch = function(...args) {
        try { window.__fetchLog.push(String(args[0]).substring(0, 200)); } catch (e) {}
        return origFetch.apply(this, args);
      };
      window.__fetchHooked = true;
    }

    return out;
  }, { wopiToken });

  console.log("[3] editor state:", JSON.stringify(result, null, 2));

  // Wait 5s for editor to make its WOPI requests
  await page.waitForTimeout(5000);

  const fetchLog = await page.evaluate(() => window.__fetchLog || []);
  console.log("[4] fetch calls (WOPI):");
  for (const u of fetchLog) {
    if (u.includes("/wopi/") || u.includes("/api/")) console.log("  -", u);
  }

  // Also intercept the actual responses
  const wopiCalls = await page.evaluate(async () => {
    const calls = [];
    for (const u of window.__fetchLog || []) {
      const s = String(u);
      if (s.includes("/wopi/files/") && s.includes("access_token")) {
        try {
          const r = await fetch(s);
          const ct = r.headers.get("content-type") || "";
          let body;
          if (ct.includes("application/json")) body = (await r.json());
          else {
            const buf = await r.arrayBuffer();
            const bytes = new Uint8Array(buf);
            body = {
              _len: bytes.length,
              _first4: Array.from(bytes.slice(0,4)).map(b => b.toString(16)).join(' '),
              _last4: Array.from(bytes.slice(-4)).map(b => b.toString(16)).join(' '),
              _ct: ct,
            };
          }
          calls.push({ url: s.substring(0, 150), status: r.status, body });
        } catch (e) {
          calls.push({ url: s.substring(0, 150), error: e.message });
        }
      }
    }
    return calls;
  });
  console.log("[5] WOPI call results:", JSON.stringify(wopiCalls, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
