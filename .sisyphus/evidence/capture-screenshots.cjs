const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  const base = "http://localhost:3006";
  const outDir = __dirname;

  console.log("Navigating to editor...");
  await page.goto(base, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for canvas to render
  console.log("Waiting for canvas...");
  await page.waitForSelector(".de-document-canvas", { timeout: 10000 });

  // Slight delay for rendering
  await page.waitForTimeout(2000);

  // Screenshot 1: Full editor page
  await page.screenshot({ path: `${outDir}/editor-ui.png`, fullPage: true });
  console.log("Saved: editor-ui.png");

  // Screenshot 2: Toolbar area only (top portion)
  await page.screenshot({
    path: `${outDir}/toolbar.png`,
    clip: { x: 0, y: 0, width: 1400, height: 120 }
  });
  console.log("Saved: toolbar.png");

  // Screenshot 3: Collaboration status widget
  const collabEl = await page.$(".de-toolbar-extra-right");
  if (collabEl) {
    const box = await collabEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${outDir}/collaboration-status.png`,
        clip: { x: box.x, y: box.y, width: box.width + 20, height: 80 }
      });
      console.log("Saved: collaboration-status.png");
    }
  } else {
    console.log("CollaborationStatus element not found - skipping");
  }

  // Screenshot 4: Remote cursor overlay area
  const holderEl = await page.$(".de-document-holder");
  if (holderEl) {
    const box = await holderEl.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${outDir}/remote-cursor-demo.png`,
        clip: { x: box.x, y: box.y, width: box.width, height: 600 }
      });
      console.log("Saved: remote-cursor-demo.png");
    }
  } else {
    console.log("DocumentHolder element not found - skipping");
  }

  await browser.close();
  console.log("Done.");
})();