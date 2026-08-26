## 1. Hyperlink (editor-ui/links)

- [ ] 1.1 Add a failing converter round-trip test: `<a href="https://x">text</a>` survives `html_to_docx`→`docx_to_html` and the ODT pair.
- [ ] 1.2 Extend `converter.py` to emit/parse `<a>` (DOCX `w:hyperlink` + ODT `text:a`).
- [ ] 1.3 Extend `sanitize.py` to allow `<a>` with safe `href` (reuse `_is_safe_url`; block `javascript:`/`data:`), keeping entity-decode escape.
- [ ] 1.4 Add a "Insert link" toolbar button + dialog (`web/index.html`), wire `insertHTML`/`createLink` in `web/editor.js`.
- [ ] 1.5 Playwright check: open editor, insert link, assert it shows and round-trips after save (mirror the image/table pattern).

## 2. Text colour & highlight (editor-ui/format-advanced)

- [ ] 2.1 Failing converter test: coloured/highlighted span round-trips DOCX + ODT.
- [ ] 2.2 Extend `converter.py` to emit/parse `color`/`background` spans (`w:rPr/w:color`, `fo:text-color`).
- [ ] 2.3 Extend `sanitize.py` with a `style` colour/background whitelist (fixed palette + `#rrggbb`; reject `url(`/`expression(`).
- [ ] 2.4 Toolbar colour + highlight pickers + superscript/subscript buttons in `web/index.html`/`editor.js`.
- [ ] 2.5 Playwright check: apply red + highlight, assert visible and persisted.

## 3. Table cell operations (editor-ui/table-cells)

- [ ] 3.1 Failing converter test: merged cell + deleted column round-trips DOCX + ODT (reuse existing `colspan`/`rowspan`).
- [ ] 3.2 Add merge/split + insert/delete row/column handlers in `converter.py` + `editor.js` (extend table dialog).
- [ ] 3.3 Toolbar/dialog controls in `web/index.html`; wire selection-based ops in `editor.js`.
- [ ] 3.4 Playwright check: merge two cells, delete a column, assert round-trip.

## 4. Insert primitives (editor-ui/insert-misc)

- [ ] 4.1 Failing converter test: `<hr>` and page break round-trip DOCX + ODT + HTML.
- [ ] 4.2 Emit/parse `<hr>` and page break in `converter.py` (+ ODT pair).
- [ ] 4.3 "Insert HR" + "Page break" buttons; symbol/emoji picker dialog in `web/index.html`/`editor.js`.
- [ ] 4.4 Playwright check: insert HR + page break + a symbol, assert persistence.

## 5. View controls (editor-ui/view-controls)

- [x] 5.1 Zoom in/out/reset control that scales the editing surface only (CSS `zoom` on `#editor`, persisted in localStorage) in `editor.js` + `index.html`.
- [x] 5.2 Dark/light theme toggle via CSS variables (`html.light` overrides `--bg/--text/...`), persisted in localStorage.
- [x] 5.3 Fullscreen control expanding the editor viewport (`.fullscreen` class + best-effort Fullscreen API).
- [x] 5.4 Playwright check: zoom in grows surface; theme toggle flips background; fullscreen toggles class.
      (`tests/e2e/test_cloud_editor_e2e.py::test_view_controls_zoom_theme_fullscreen`)

## 6. File operations (editor-ui/file-ops)

- [ ] 6.1 "New" control: blank document + fresh store entry (confirm before discard) in `editor.js` + router.
- [ ] 6.2 Add `GET /api/documents/{id}/export/{fmt}` for `odt` and `html` (server-side convert); PDF if a lightweight renderer is available, else defer.
- [ ] 6.3 Print control opening browser print dialog with paper styling.
- [ ] 6.4 Playwright check: export to ODT, assert valid file; new document clears editor.

## 7. Collaboration presence (editor-ui/collab-presence)

- [ ] 7.1 Render remote carets from the existing SSE presence channel; colour per `client_id`; remove on leave (overlay in `editor.js`).
- [ ] 7.2 Avatar/label per peer with stable colour; distinct local identity.
- [ ] 7.3 Playwright check: two editors join, assert each sees the other's coloured caret + label.

## 8. Status & indicators (editor-ui/status-bar)

- [x] 8.1 Status bar in `web/index.html` + live word/char count in `editor.js` (GREEN)
- [x] 8.2 Save-status indicator (saved/saving/dirty) reflecting the actual WOPI PUT
      (`#status` + `markDirty`/`saveDocument`; already wired)
- [ ] 8.3 Offline indicator using the existing service worker; queue edits locally when host unreachable.
- [x] 8.4 Playwright check: type → count updates; edit after save → "unsaved" then "saved"/"ready"
      (`tests/e2e/test_cloud_editor_e2e.py::test_status_bar_word_count_and_save_indicator`)

## 9. Cross-cutting

- [ ] 9.1 Add `ruff` + converter round-trip regression tests for every new element; ensure `pytest` suite stays green.
- [ ] 9.2 Document the new UI elements in `docs/testing/test-scenarios.md` as user stories (continue the US-25..US-60 style).
- [ ] 9.3 Review against the earlier lesson: "done" ≠ green — run the full local suite + a Playwright pass before marking any task complete.
