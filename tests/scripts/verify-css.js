const { chromium } = require("playwright");
const helpers = require("../tests/e2e/helpers/ocis-helpers");

const OCIS_URL = process.env.OCIS_URL || "https://cloud.graphwiz.ai";
const EODOCS_URL = process.env.EODOCS_URL || "https://editor.cloud.graphwiz.ai";
const TEST_USER = process.env.TEST_USER || "admin";
const TEST_PASS = process.env.TEST_PASS || "wo-od-2026";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const token = await helpers.loginToOCIS(page, TEST_USER, TEST_PASS);

  // Upload via helper (creates folder + PUTs docx + PROPFIND for fileId)
  const filename = `verify-css-${Date.now()}.docx`;
  await helpers.uploadTestDoc(page, token, filename);
  const fileId = await helpers.getFileId(page, token, filename);

  console.log(`[1] fileId: ${fileId}`);

  // /app/open
  const session = await helpers.callAppOpen(page, token, fileId);
  const { wopiSrc, wopiToken } = helpers.parseWopiSession(session);
  console.log(`[2] wopiSrc host: ${new URL(wopiSrc).host}`);

  await helpers.openEditorInBrowser(page, wopiSrc, wopiToken);

  // Wait for body editor with content (per b7: 3 editors, body needs non-empty text)
  const editor = await helpers.waitForEditorFrame(page, 30000);
  if (!editor) {
    console.error("[ERR] body editor never became ready");
    await page.screenshot({ path: "test-results/verify-css-fail.png" });
    await browser.close();
    process.exit(2);
  }
  console.log("[2.5] body editor ready");

  // Inject list + heading + blockquote into body editor, then read computed style
  const result = await page.evaluate(() => {
    const editors = document.querySelectorAll(".ProseMirror");
    let bodyEditor = null;
    for (const el of editors) {
      if (el.closest("[data-header-footer-region]")) continue;
      if (el.closest(".de-document-holder, .rich-text-editor")) { bodyEditor = el; break; }
    }
    if (!bodyEditor) return { error: "no body editor found", count: editors.length };

    bodyEditor.focus();
    bodyEditor.innerHTML = `
      <ul><li>Item one</li><li>Item two</li></ul>
      <ol><li>First</li><li>Second</li></ol>
      <h1>Heading 1</h1>
      <h4>Heading 4</h4>
      <blockquote>A quote</blockquote>
      <pre>code here</pre>
      <p>Normal paragraph</p>
      <a href="https://example.com">A link</a>
    `;

    const style = (el, prop) => {
      if (!el) return null;
      return getComputedStyle(el)[prop];
    };

    const ul = bodyEditor.querySelector("ul:not([data-type='taskList'])");
    const ol = bodyEditor.querySelector("ol");
    const li = bodyEditor.querySelector("li");
    const h1 = bodyEditor.querySelector("h1");
    const h4 = bodyEditor.querySelector("h4");
    const bq = bodyEditor.querySelector("blockquote");
    const pre = bodyEditor.querySelector("pre");
    const a = bodyEditor.querySelector("a");

    return {
      ulListStyle: style(ul, "listStyleType"),
      ulPaddingLeft: style(ul, "paddingLeft"),
      olListStyle: style(ol, "listStyleType"),
      olPaddingLeft: style(ol, "paddingLeft"),
      liMarginTop: style(li, "marginTop"),
      h1FontSize: style(h1, "fontSize"),
      h4FontSize: style(h4, "fontSize"),
      bqBorderLeft: style(bq, "borderLeftWidth"),
      bqColor: style(bq, "color"),
      preBackground: style(pre, "backgroundColor"),
      aColor: style(a, "color"),
      aDecoration: style(a, "textDecoration"),
    };
  });

  console.log("[3] computed styles:", JSON.stringify(result, null, 2));

  const expectations = {
    ulListStyle: v => v === "disc",
    olListStyle: v => v === "decimal",
    h4FontSize: v => parseFloat(v) > 0,
    aColor: v => v === "rgb(5, 99, 193)",
    bqBorderLeft: v => v === "3px",
  };
  const pass = Object.entries(expectations).map(([k, pred]) => ({
    k, v: result[k], pass: pred(result[k])
  }));
  console.log("[4] expectation checks:", JSON.stringify(pass, null, 2));

  await page.screenshot({ path: "test-results/verify-css.png", fullPage: false });

  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
