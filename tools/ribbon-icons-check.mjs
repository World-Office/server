#!/usr/bin/env node
// Gate for campaign WO-RIBBON-ICONS: the .toolbar button svg rule must size
// toolbar icons uniformly (22-24px) and center them within the 46px button.
// WO icon designs stay as authored; this only asserts the rendering rules.
import fs from "node:fs";

const css = fs.readFileSync("apps/web/apps/documenteditor-wysiwyg/style.css", "utf8");
const idx = css.indexOf(".toolbar button svg");
if (idx < 0) {
  console.error("ribbon-icons: FAIL — no `.toolbar button svg` rule");
  process.exit(1);
}
const end = css.indexOf("}", idx);
const block = css.slice(idx, end + 1);
const hasSize = /width:\s*2[2-4]px/.test(block) && /height:\s*2[2-4]px/.test(block);
const hasCenter =
  /translateY/.test(block) ||
  /align-items:\s*center/.test(block) ||
  /justify-content:\s*center/.test(block) ||
  /top:\s*50%/.test(block);
if (!hasSize || !hasCenter) {
  console.error("ribbon-icons: FAIL — svg rule needs 22-24px size + vertical centering:");
  console.error(block);
  process.exit(1);
}
console.log("ribbon-icons: OK — toolbar svg normalized (22-24px, centered)");