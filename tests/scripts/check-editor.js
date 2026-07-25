const { chromium } = require("playwright");
const helpers = require("/home/weiss/git/World-Office/server/tests/tests/e2e/helpers/ocis-helpers.js");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  page.on("console", msg => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[${t}]`, msg.text().substring(0, 300));
    }
  });
  page.on("pageerror", err => console.log("[pageerror]", err.message.substring(0, 300)));

  const token = await helpers.loginToOCIS(page, "admin", "wo-od-2026");
  const filename = `chk-${Date.now()}.docx`;
  await helpers.uploadTestDoc(page, token, filename);
  const fileId = await helpers.getFileId(page, token, filename);
  const open = await helpers.callAppOpen(page, token, fileId);
  await helpers.openEditorInBrowser(page, open.app_url, open.access_token);

  await page.waitForTimeout(8000);

  const info = await page.evaluate(() => {
    const editors = document.querySelectorAll(".ProseMirror");
    const root = document.querySelector("#root");
    return {
      editorCount: editors.length,
      editorTexts: Array.from(editors).map(e => e.textContent.substring(0, 60)),
      rootChildCount: root ? root.children.length : 0,
      bodyHTML: document.body.innerHTML.length,
      hasErrorPage: !!document.querySelector(".error-page, .de-document-holder--error"),
      bodyInnerText: document.body.innerText.substring(0, 500),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: "/home/weiss/git/World-Office/server/tests/test-results/check-editor.png" });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
