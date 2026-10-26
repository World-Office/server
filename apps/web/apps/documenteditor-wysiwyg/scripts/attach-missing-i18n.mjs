// BUG1-STATIC-AUDIT codemod: attach data-i18n attributes to buttons that
// have user-visible text or title but no data-i18n. One-off tool; kept in
// scripts/ for provenance. Every anchor must match exactly once or the
// script aborts without writing.
import { readFileSync, writeFileSync } from "node:fs";

const HTML = "index.html";
let src = readFileSync(HTML, "utf8");

// [literal anchor (must be unique), attrs to insert right after the anchor]
// Titled buttons get data-i18n-title (+ data-i18n-aria-label when the
// aria-label duplicates the title text — same key, matching the btn-find
// convention).
const targets = [
  // --- titlebar / view chrome ---------------------------------------------
  ['<button type="button" class="titlebar-fs" title="Fullscreen"', ' data-i18n-title="View.Fullscreen" data-i18n-aria-label="View.Fullscreen"'],
  ['<button id="btn-fullscreen"', ' data-i18n-title="View.FullscreenToggle" data-i18n-aria-label="View.FullscreenToggle"'],
  ['<button id="btn-theme"', ' data-i18n-title="View.ThemeToggle" data-i18n-aria-label="View.ThemeToggle"'],
  ['<button type="button" id="btn-ai-review"', ' data-i18n="AI.ChangesTab"'],
  // --- ribbon icon buttons --------------------------------------------------
  ['<button id="btn-table-ops"', ' data-i18n-title="Table.ActionsTitle" data-i18n-aria-label="Table.Actions"'],
  ['<button id="btn-link"', ' data-i18n-title="Toolbar.InsertLinkTitle" data-i18n-aria-label="Toolbar.InsertLinkTitle"'],
  ['<button id="btn-hr"', ' data-i18n-title="Toolbar.HRTitle" data-i18n-aria-label="Toolbar.HRTitle"'],
  ['<button id="btn-object"', ' data-i18n-title="Toolbar.ObjectTitle" data-i18n-aria-label="Toolbar.ObjectTitle"'],
  ['<button id="btn-bookmark"', ' data-i18n-title="Toolbar.BookmarkTitle" data-i18n-aria-label="Toolbar.BookmarkTitle"'],
  ['<button id="btn-crossref"', ' data-i18n-title="Toolbar.CrossrefTitle" data-i18n-aria-label="Toolbar.CrossrefTitle"'],
  ['<button id="btn-symbol"', ' data-i18n-title="Toolbar.SymbolTitle" data-i18n-aria-label="Toolbar.SymbolTitle"'],
  ['<button id="btn-toc"', ' data-i18n-title="Toolbar.TocTitle" data-i18n-aria-label="Toolbar.TocTitle"'],
  ['<button id="btn-track-changes"', ' data-i18n-title="Statusbar.TrackChanges" data-i18n-aria-label="Statusbar.TrackChanges"'],
  ['<button id="btn-review-changes"', ' data-i18n-title="Review.Changes" data-i18n-aria-label="Review.Changes"'],
  ['<button id="btn-comment"', ' data-i18n-title="Ctx.AddComment" data-i18n-aria-label="Ctx.AddComment"'],
  ['<button id="btn-comments"', ' data-i18n-title="Comments.Show" data-i18n-aria-label="Comments.Show"'],
  ['<button class="sb menu-trigger caret-btn" id="doc-lang-caret"', ' data-i18n-title="Menu.LanguageOptions" data-i18n-aria-label="Menu.LanguageOptions"'],
  ['<button id="btn-find-close"', ' data-i18n-title="Dialog.Close" data-i18n-aria-label="Find.ClosePanel"'],
  ['<button id="btn-review-close"', ' data-i18n-aria-label="Review.ClosePanel"'],
  ['<button class="rb" data-cmd="removeFormat"', ' data-i18n-title="Toolbar.ClearStyleTitle" data-i18n-aria-label="Toolbar.ClearStyleTitle"'],
  // --- statusbar zoom / multipage -------------------------------------------
  ['<button class="sb" id="btn-zoom-out"', ' data-i18n-title="View.ZoomOut" data-i18n-aria-label="View.ZoomOut"'],
  ['<button class="sb sb-boxed" id="btn-zoom-in"', ' data-i18n-title="View.ZoomIn" data-i18n-aria-label="View.ZoomIn"'],
  ['<button class="sb" id="btn-zoom-fit"', ' data-i18n-title="View.Fit" data-i18n-aria-label="View.Fit"'],
  ['<button class="sb" id="btn-zoom-reset"', ' data-i18n-title="View.ZoomReset" data-i18n-aria-label="View.ZoomReset"'],
  ['<button class="sb" id="btn-multipage"', ' data-i18n-title="View.MultiplePages" data-i18n-aria-label="View.MultiplePages"'],
  // --- table-ops popover ------------------------------------------------------
  ['<button id="op-row-above"', ' data-i18n="Table.InsertRowAbove"'],
  ['<button id="op-row-below"', ' data-i18n="Table.InsertRowBelow"'],
  ['<button id="op-col-left"', ' data-i18n="Table.InsertColLeft"'],
  ['<button id="op-col-right"', ' data-i18n="Table.InsertColRight"'],
  ['<button id="op-del-row"', ' data-i18n="Table.DeleteRow"'],
  ['<button id="op-del-col"', ' data-i18n="Table.DeleteCol"'],
  ['<button id="op-merge"', ' data-i18n="Table.MergeCells"'],
  ['<button id="op-split"', ' data-i18n="Table.SplitCell"'],
  ['<button id="btn-table-ops-close"', ' data-i18n="Dialog.Close"'],
  // --- shared dialog scaffolding ------------------------------------------------
  ...["btn-table-cancel", "btn-notes-close", "btn-pagenumber-close",
      "btn-headerfooter-close", "btn-trackchanges-close", "btn-dropcap-close",
      "btn-linenumbers-close", "btn-hyphenation-close", "btn-watermark-close",
      "btn-pagecolor-close", "btn-colors-close", "btn-addtext-close",
      "btn-updatetoc-close", "btn-displaymode-close", "btn-link-cancel",
      "btn-columns-cancel", "btn-toc-cancel", "btn-borders-cancel",
      "btn-object-cancel", "btn-bookmark-cancel", "btn-crossref-cancel",
      "btn-ai-propose-cancel", "btn-ps-cancel", "btn-comment-cancel",
      "btn-settings-cancel", "btn-suggest-cancel", "btn-field-cancel",
      "btn-cc-cancel", "btn-chart-cancel", "btn-equation-cancel",
      "btn-smartart-cancel"]
      .map((id) => [`<button id="${id}"`, ` data-i18n="Dialog.Cancel"`]),
  ...["btn-table-ok", "btn-notes-ok", "btn-pagenumber-ok",
      "btn-headerfooter-ok", "btn-link-ok", "btn-columns-ok",
      "btn-toc-ok", "btn-object-ok", "btn-bookmark-ok",
      "btn-crossref-ok", "btn-field-ok", "btn-cc-ok"]
      .map((id) => [`<button id="${id}"`, ` data-i18n="Dialog.Insert"`]),
  ...["btn-trackchanges-ok", "btn-dropcap-ok", "btn-linenumbers-ok",
      "btn-hyphenation-ok", "btn-watermark-ok", "btn-pagecolor-ok",
      "btn-colors-ok", "btn-addtext-ok", "btn-displaymode-ok"]
      .map((id) => [`<button id="${id}"`, ` data-i18n="Dialog.OK"`]),
  ...["btn-borders-ok", "btn-ps-apply", "btn-settings-ok"]
      .map((id) => [`<button id="${id}"`, ` data-i18n="Dialog.Apply"`]),
  ...["btn-ai-review-close", "btn-symbol-close", "btn-info-close",
      "btn-help-close", "btn-mailmerge-close"]
      .map((id) => [`<button id="${id}"`, ` data-i18n="Dialog.Close"`]),
  ['<button id="btn-updatetoc-ok"', ' data-i18n="Dialog.Update"'],
  // --- special dialog actions -----------------------------------------------------
  ['<button id="btn-ai-reject-all"', ' data-i18n="Dialog.RejectAll"'],
  ['<button id="btn-ai-propose-run"', ' data-i18n="Dialog.Propose"'],
  ['<button id="btn-comment-ok"', ' data-i18n="Dialog.Comment"'],
  ['<button id="btn-suggest-send"', ' data-i18n="Dialog.ComposeEmail"'],
  ['<button id="btn-mailmerge-csv"', ' data-i18n="Dialog.ChooseCsvFile"'],
  ['<button id="btn-mailmerge-field"', ' data-i18n="Backstage.FieldTitle"'],
  ['<button id="btn-mailmerge-preview"', ' data-i18n="Dialog.PreviewMerged"'],
  ['<button id="btn-chart-ok"', ' data-i18n="Dialog.InsertChart"'],
  ['<button id="btn-equation-ok"', ' data-i18n="Dialog.InsertEquation"'],
  ['<button id="btn-smartart-ok"', ' data-i18n="Dialog.InsertDiagram"'],
  // --- object layout popover -------------------------------------------------------
  ['<button type="button" id="btn-wrap-inline"', ' data-i18n="Layout.Wrapping.Inline"'],
  ['<button type="button" id="btn-wrap-square"', ' data-i18n="Layout.Wrapping.Square"'],
  ['<button type="button" id="btn-wrap-behind"', ' data-i18n="Layout.Wrapping.Behind"'],
  ['<button type="button" id="btn-align-left"', ' data-i18n="Backstage.ObjLayout.AlignLeft"'],
  ['<button type="button" id="btn-align-center"', ' data-i18n="Backstage.ObjLayout.AlignCenter"'],
  ['<button type="button" id="btn-align-right"', ' data-i18n="Backstage.ObjLayout.AlignRight"'],
  ['<button type="button" id="btn-layer-back"', ' data-i18n="Layout.Object.SendBackward"'],
  ['<button type="button" id="btn-layer-front"', ' data-i18n="Layout.Object.BringForward"'],
  ['<button type="button" id="btn-objlayout-close"', ' data-i18n="Dialog.Done"'],
];

let applied = 0;
for (const [anchor, attrs] of targets) {
  const count = src.split(anchor).length - 1;
  if (count !== 1) {
    console.error(`ABORT: anchor matched ${count} times (expected 1): ${anchor}`);
    process.exit(1);
  }
  src = src.replace(anchor, anchor + attrs);
  applied++;
}
writeFileSync(HTML, src);
console.log(`codemod applied ${applied} data-i18n insertions`);
