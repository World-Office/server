# documenteditor-wysiwyg (WOPI WYSIWYG word editor)

Vendored from `opencloud-docserver/web/` (Python docserver, final state
`cf98bf78e`) + `wo-bridge.js` — the WOPI adapter that lets the unchanged
editor run against the **Rust wo-docserver**.

- `editor.js`, `i18n.js`, `style.css` — byte-identical to the Python repo.
- `index.html` — adapted: no Jinja globals, no service worker, loads
  `wo-bridge.js` before `editor.js` (deferred until WOPI boot settles).
- `wo-bridge.js` — intercepts `window.fetch` for the python-docserver API
  surface (`/api/documents/{id}/html|save|export|import-docx|versions|protect|
  collab/*|ai/*`, `/api/plugins`) and serves it from wo-docserver WOPI
  (CheckFileInfo / GetFile / PutFile via `?access_token=`) and
  `/api/conversion/convert`. Standalone (no WOPI params) = passthrough.

Deploy: copy this dir over `{EDITOR_UI_DIR}/word/` in the docserver container
(UI is bind-mounted static content — no Rust rebuild).

Known gaps (Rust converter, future work in `core/crates/wo-x2t`):
- docx headers/footers not extracted into the editor's page furniture.
- save wraps the fragment (`<html><body>`) because wo-x2t needs a full
  document; export uses the last saved docx bytes.
- ai/* endpoints return 503 (agentic loop stays on the Python docserver).
