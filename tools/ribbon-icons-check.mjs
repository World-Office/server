#!/usr/bin/env node
// Gate for campaign WO-RIBBON-ICONS: the .toolbar button svg rule must size
// toolbar icons uniformly (22-24px). WO icon designs stay as authored; this
// only asserts the rendering size. Vertical centering is verified post-merge
// by the chrome pixel gate.
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
if (!hasSize) {
  console.error("ribbon-icons: FAIL — svg rule needs 22-24px size:");
  console.error(block);
  process.exit(1);
}
console.log("ribbon-icons: OK — toolbar svg normalized (22-24px)");