const { chromium } = require("playwright");
const helpers = require("../tests/e2e/helpers/ocis-helpers.js");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const token = await helpers.loginToOCIS(page, "admin", "wo-od-2026");
  const filename = `rt-${Date.now()}.docx`;
  await helpers.uploadTestDoc(page, token, filename);
  const fileId = await helpers.getFileId(page, token, filename);

  // Download the file back
  const result = await page.evaluate(async ({ url, token }) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return {
      status: r.status,
      length: bytes.length,
      first4: Array.from(bytes.slice(0,4)).map(b => b.toString(16)).join(' '),
      last4: Array.from(bytes.slice(-4)).map(b => b.toString(16)).join(' '),
    };
  }, { url: `https://cloud.graphwiz.ai/dav/files/admin/WOPITest/${filename}`, token });

  console.log("uploaded 1002 bytes, downloaded:", JSON.stringify(result, null, 2));

  // Call the conversion API directly (from editor domain to avoid CORS)
  await page.goto("https://editor.cloud.graphwiz.ai/", { waitUntil: "domcontentloaded" }).catch(() => {});
  const b64 = helpers.MINIMAL_DOCX_B64;
  const conv = await page.evaluate(async ({ b64 }) => {
    const r = await fetch("https://editor.cloud.graphwiz.ai/api/conversion/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_format: "docx", target_format: "html", data: b64 }),
    });
    return { status: r.status, body: await r.text() };
  }, { b64 });

  console.log("conversion status:", conv.status);
  console.log("conversion body:", conv.body.substring(0, 500));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
