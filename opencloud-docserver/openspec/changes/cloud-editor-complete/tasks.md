# Tasks: Cloud Editor — Complete Collaborative Office Editing

Build order is TDD (RED → GREEN). Each phase has a failing test before implementation.

## Phase 0 — Mock WOPI host + contract tests (prove the loop)
- [ ] T0.1 contract test: mock WOPI host exposes CheckFileInfo/PutFile/Lock and the docserver's wopi_router satisfies it (RED)
- [ ] T0.2 implement mock WOPI host (small FastAPI app or test fixture) + wire to docserver RemoteWopiClient (GREEN)
- [ ] T0.3 contract test: open→edit→save round-trips office bytes from host through docserver back to host (RED→GREEN)

## Phase 1 — Tiptap editing surface + HTML round-trip
- [ ] T1.1 contract test: GET /api/documents/{doc_id}/html returns semantic HTML; PUT /contents stores it (RED)
- [ ] T1.2 integrate Tiptap in web/editor.js; wire to /html + /save; convert HTML→office on save (GREEN)
- [ ] T1.3 test: Tiptap output survives office→HTML→office round-trip (tables/lists/headings) (RED→GREEN)

## Phase 2 — Real-time collaboration wiring
- [ ] T2.1 contract test: two clients editing same doc converge via /collab/stream + /collab/ops (RED)
- [ ] T2.2 wire editor.js EventSource(/collab/stream), POST /collab/ops, POST /collab/presence (GREEN)
- [ ] T2.3 render remote cursors + live text from TextCRDT (GREEN)
- [ ] T2.4 test: presence list reflects connected clients (RED→GREEN)

## Phase 3 — PostMessage bridge + lock lifecycle
- [ ] T3.1 contract test: editor notifies host via PostMessage on save/edit/close; lock acquired+refreshed+released (RED)
- [ ] T3.2 implement PostMessage bridge in editor.js + lock lifecycle in router (GREEN)

## Phase 4 — UI feature specs
- [ ] T4.1 view-controls: zoom slider, dark-mode toggle, fullscreen/print-layout (RED→GREEN)
- [ ] T4.2 status-bar: connection / last-saved / lock / collaborators (RED→GREEN)
- [ ] T4.3 table-cells: insert/edit/delete tables (RED→GREEN)
- [ ] T4.4 links: insert/edit hyperlinks (RED→GREEN)
- [ ] T4.5 insert-misc: image/horizontal-rule/special-char (RED→GREEN)
- [ ] T4.6 format-advanced: headings/lists/alignment/color parity (RED→GREEN)

## Phase 5 — E2E + docs
- [ ] T5.1 Playwright E2E against mock WOPI host: open→edit→save→second client sees live edits (RED→GREEN)
- [ ] T5.2 README + run notes for mock host + real OpenCloud/Nextcloud
