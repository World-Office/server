/**
 * home-overflow.test.mjs — CHROME-F: validates the Startseite (Home) OO
 * grouping with rb-groups (Schriftart | Absatz | Formatvorlagen) + 'Mehr'
 * overflow menu for the rest, instead of one flat 48-button row.
 *
 * Run: node home-overflow.test.mjs   (prints OVERFLOW-PASS on the last line)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const i18nSrc = readFileSync(resolve(HERE, "i18n.js"), "utf8");

// Find the home ribbon page
const homePageStart = html.indexOf('<div class="ribbon-page active" data-tab="home"');
assert.ok(homePageStart !== -1, "Home ribbon page exists");

// Get the home page content
function findClosingDiv(start) {
  let depth = 0;
  let pos = start;
  while (pos < html.length) {
    const openIdx = html.indexOf('<div', pos);
    const closeIdx = html.indexOf('</div>', pos);
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth++;
      pos = openIdx + 1;
    } else if (closeIdx !== -1) {
      depth--;
      pos = closeIdx + 6;
      if (depth === 0) return closeIdx + 6;
    } else {
      break;
    }
  }
  return html.length;
}

const homePageEnd = findClosingDiv(homePageStart);
const homePage = html.slice(homePageStart, homePageEnd);

// Check that we have i18n keys for the group labels
assert.ok(i18nSrc.includes('"Aria.Font":'), "i18n has Aria.Font key");
assert.ok(i18nSrc.includes('"Aria.Paragraph":'), "i18n has Aria.Paragraph key");
assert.ok(i18nSrc.includes('"Aria.ParagraphStyles":'), "i18n has Aria.ParagraphStyles key (Formatvorlagen)");
assert.ok(i18nSrc.includes('"Home.More":'), "i18n has Home.More key");

// Check that the groups use i18n for aria-label (order may vary: data-i18n-aria-label before or after aria-label)
assert.match(homePage, /<div class="rb-group"[^>]*aria-label="Font"[^>]*data-i18n-aria-label="Aria\.Font"[^>]*>/,
  "Font group has i18n aria-label (Schriftart)");
assert.match(homePage, /<div class="rb-group"[^>]*aria-label="Paragraph"[^>]*data-i18n-aria-label="Aria\.Paragraph"[^>]*>/,
  "Paragraph group has i18n aria-label (Absatz)");
assert.match(homePage, /<div class="rb-group rb-styles"[^>]*data-i18n-aria-label="Aria\.ParagraphStyles"[^>]*aria-label="Paragraph styles"[^>]*>/,
  "Style templates group has i18n aria-label (Formatvorlagen)");

// Check for Mehr overflow menu
assert.match(homePage, /<button[^>]*data-i18n="Home\.More"[^>]*>/, "Mehr overflow button exists with i18n key Home.More");
assert.match(homePage, /<button[^>]*class="menu-trigger[^>]*"[^>]*data-i18n-aria-label="Home\.More"[^>]*>/, 
  "Mehr overflow menu has i18n aria-label");

// Check German translations exist
assert.ok(i18nSrc.includes('"Aria.Font": "Schriftart"'), "German: Aria.Font = Schriftart");
assert.ok(i18nSrc.includes('"Aria.Paragraph": "Absatz"'), "German: Aria.Paragraph = Absatz");
assert.ok(i18nSrc.includes('"Aria.ParagraphStyles": "Formatvorlagen"'), "German: Aria.ParagraphStyles = Formatvorlagen");
assert.ok(i18nSrc.includes('"Home.More": "Mehr"'), "German: Home.More = Mehr");

console.log("OVERFLOW-PASS");
