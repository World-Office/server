const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  const base = "http://localhost:3006";
  const outDir = process.env.OUT_DIR || "/home/weiss/git/World-Office/server/.sisyphus/evidence/screenshots";

  try {
    console.log("Navigating to editor...");
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });

    console.log("Waiting for React to mount...");
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log("Page title:", title);

    const canvasExists = await page.$(".de-document-canvas");
    console.log("Canvas found:", !!canvasExists);

    const toolbarExists = await page.$(".de-toolbar");
    console.log("Toolbar found:", !!toolbarExists);

    if (canvasExists) {
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: `${outDir}/editor-ui.png`, fullPage: true });
    console.log("Saved: editor-ui.png");

    await page.screenshot({
      path: `${outDir}/toolbar.png`,
      clip: { x: 0, y: 0, width: 1400, height: 120 }
    });
    console.log("Saved: toolbar.png");

    const collabEl = await page.$(".de-toolbar-extra-right");
    if (collabEl) {
      const box = await collabEl.boundingBox();
      if (box) {
        await page.screenshot({
          path: `${outDir}/collaboration-status.png`,
          clip: { x: box.x, y: box.y - 20, width: box.width + 40, height: 60 }
        });
        console.log("Saved: collaboration-status.png");
      }
    } else {
      console.log("CollabStatus element not found");
      await page.screenshot({ path: `${outDir}/collaboration-status.png`, clip: { x: 1180, y: 0, width: 220, height: 60 } });
      console.log("Saved fallback: collaboration-status.png");
    }

    const holderEl = await page.$(".de-document-holder");
    if (holderEl) {
      const box = await holderEl.boundingBox();
      if (box) {
        await page.screenshot({
          path: `${outDir}/remote-cursor-demo.png`,
          clip: { x: box.x, y: box.y, width: box.width, height: 500 }
        });
        console.log("Saved: remote-cursor-demo.png");
      }
    } else {
      console.log("DocumentHolder element not found");
      await page.screenshot({ path: `${outDir}/remote-cursor-demo.png`, clip: { x: 0, y: 60, width: 1400, height: 500 } });
      console.log("Saved fallback: remote-cursor-demo.png");
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${outDir}/error-screenshot.png`, fullPage: true });
    console.log("Saved error screenshot");
  }

  await browser.close();
  console.log("Done.");
})();