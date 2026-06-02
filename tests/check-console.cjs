const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on("console", msg => {
    if (msg.type() === "error") {
      errors.push(`[ERROR] ${msg.text()}`);
    }
  });
  page.on("pageerror", err => {
    errors.push(`[PAGEERROR] ${err.message}`);
  });

  await page.goto("http://localhost:3006", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 });
  await page.waitForTimeout(5000);

  console.log("Errors found:", errors.length);
  errors.forEach(e => console.log(e));

  if (errors.length === 0) {
    console.log("No errors - checking DOM content...");
    const rootContent = await page.evaluate(() => {
      const root = document.getElementById("root");
      return root ? root.innerHTML.substring(0, 800) : "NO ROOT ELEMENT";
    });
    console.log("Root content:", rootContent);
  }

  await browser.close();
})();