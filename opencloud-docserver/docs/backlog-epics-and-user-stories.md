# World-Office — Epic & User-Story Backlog

> **Canonical product:** `opencloud-docserver` (Python FastAPI WOPI docserver + vanilla-JS editor + OpenCloud/OCIS).
> **Direction:** Stoic Unix rewrite — one process, one job (edit office documents through OpenCloud).
> **Created:** 2026-08-27  ·  **Status source:** `docs/office-research/feature-graph.md` (last sweep 2026-08-26, suite 467 green).

This is the product backlog: **epics** (large capability areas) decomposed into
**user stories** (small, shippable, user-valuable increments). It is the input
for OpenSpec changes: when a story is scheduled, promote its spec fragment to
`openspec/changes/<name>/` (see “Backlog → change” at the end).

## Legend

| Mark | Meaning |
|------|---------|
| 🔲 | Not started (candidate) |
| 🔶 | Started / partial (some stories done) |
| ✅ | Substantially delivered — remaining stories are polish |
| P0 / P1 / P2 | Priority: do-now / soon / sometime |
| ⚖️ | Aligned with Stoic checks (§7 of RETHINK) — review when we say yes |

---

## E1 — Table editing power
Status: 🔶 (insert/add-row/merge/header/caption done) · Priority: P1
Closes the remaining `feature-graph` table gaps: **borders, shading, width/height** (all ❌), and makes **split** a real user operation.

- **E1S1** (P1) As a **teacher**, I want to apply borders and shading to tables/cells, so handout tables look polished.
  Acceptance: border/shading controls survive DOCX & ODT round-trip (`w:tcBorders`/`w:shd` ↔ `fo:border`/`fo:background-color`).
- **E1S2** (P1) As an **author**, I want to set column width and row height, so tables fit the page.
  Acceptance: width/height round-trip both formats; nested `data-*` attributes survive sanitize.
- **E1S3** (P2) As a **user**, I want a “split cell” action split/unsplit cells, so I don’t rebuild tables.
  Acceptance: split emits `w:tcPr/w:vMerge`+`w:gridSpan` ↔ ODT `table:number-columns-spanned`, and unsplit re-joins.
- **E1S4** (P2) As a **user**, I want to paste a table from the clipboard, so I can work faster.
  Acceptance: pasted table HTML becomes a real round-tripping table (no raw HTML leakage).
- **E1S5** (P2) As a **user**, I want tables to shrink-wrap long cell text on print, so nothing overflows.
  Acceptance: long-cell docs round-trip and print-width stays inside page.

## E2 — Objects that mean something
Status: 🔶 (image insert/resize + shape/textbox/chart/equation placeholders round-trip) · Priority: P1
Today objects are purposeful *placeholders*; this epic makes them real content.

- **E2S1** (P1) As a **teacher**, I want to author equations with real math (LaTeX → MathML), not a placeholder box.
  Acceptance: `<div class="object" data-type="equation">` carries editable MathML that round-trips DOCX `m:oMath` ↔ ODT `math:math`.
- **E2S2** (P1) As an **analyst**, I want to enter chart data and labels, so the chart shows my numbers.
  Acceptance: chart data lives in a `data-*`/JSON payload that round-trips `c:chart` ↔ `chart:chart`.
- **E2S3** (P2) As a **user**, I want inline ↔ floating image wrap styles, so layouts look right.
  Acceptance: wrap choice maps to `w:drawing` inline vs anchor ↔ ODT `draw:frame` anchored form.
- **E2S4** (P2) As an **author**, I want to set alt text on images and objects, so the document is accessible.
  Acceptance: `alt`/`svg:title` already round-trips; expose it in the image dialog.
- **E2S5** (P2) As a **user**, I want to edit text inside a textbox/shape online, so placeholders become usable.
  Acceptance: `wps:txbxContent` ↔ `draw:text-box` inner text is editable and survives round-trip.

## E3 — Real-time collaboration & versions
Status: 🔶 (CRDT hub, comments, track-changes live) · Priority: P0
The flagship epic. Re-scopes two deferred items — **presence carets** (was “explicitly out of scope” in cloud-editor-complete) and **version history** (❌ REQUIRES collab) — into active work.

- **E3S1** (P0) As a **co-author**, I want to see remote carets and avatar labels, so I know where others are editing.
  Acceptance: `collab-presence` spec scenarios pass (caret appears, follows edits, disappears on leave).
- **E3S2** (P0) As an **author**, I want to browse and restore earlier versions of a document, so mistakes are reversible.
  Acceptance: version list + restore through the WOPI store; `src/lib/store.py` gains versioned content blobs.
- **E3S3** (P1) As a **co-author**, I want comments and review decisions to appear live on other screens.
  Acceptance: comment insert/accept/reject broadcast via the CRDT hub without full save.
- **E3S4** (P1) As a **team**, I want edits to merge without losing work when two people save simultaneously.
  Acceptance: concurrent-save test keeps both authors’ text (extends `tests/test_collab_sync.py`).
- **E3S5** (P2) As a **reviewer**, I want change notifications (“Alice commented”), so the loop closes.
  Acceptance: host notification via WOPI/`notifyHost` for review events.

## E4 — Offline & resilient editing
Status: 🔲 · Priority: P2 · Source: `web/sw.js` exists (service worker registered, served from disk)
- **E4S1** (P2) As a **commuter**, I want to keep editing when the network drops, so I don’t lose flow.
  Acceptance: offline queue buffers edits; WOPI PutFile replays on reconnect (idempotent by lock token).
- **E4S2** (P1) As a **user**, I want autosave, so a crash never costs me work.
  Acceptance: draft snapshot every N seconds; recovered on next open (draft ≠ saved version).
- **E4S3** (P2) As a **user**, I want the editor shell to open offline from cache, so I can start reading immediately.
  Acceptance: `sw.js` precaches editor assets; verified via Playwright offline context.

## E5 — Accessibility & internationalization
Status: 🔶 (a11y find-dialog, some labels) · Priority: P1 · Sources: `web/i18n.js`, e2e a11y tests
- **E5S1** (P0) As a **screen-reader user**, I want full keyboard/screen-reader operation, so I can author documents.
  Acceptance: axe-core mock passes on the editor; keyboard executes every toolbar action.
- **E5S2** (P1) As a **user**, I want the UI in my language, so I can work comfortably.
  Acceptance: `i18n.js` message table completes for ≥ EN + DE; UI strings externalized.
- **E5S3** (P2) As an **RTL user**, I want right-to-left document and UI flow.
  Acceptance: existing `dir=rtl` round-trip honored in toolbar/menus; layout mirrors.
- **E5S4** (P2) As a **low-vision user**, I want dark mode and zoom to persist per browser.
  Acceptance: preferences in `localStorage`/`window.__USER_*` handshake, restored on load.

## E6 — Export & print fidelity
Status: 🔶 (export-pdf/odt/html/docx, print-layout CSS) · Priority: P1
- **E6S1** (P1) As a **user**, I want PDF export that matches print pagination, so handouts look right in print.
  Acceptance: weasyprint/Chromium print pipeline honors page headers/footers/page numbers (`<header class="page-header">`, `<footer class="page-footer">`, `<span class="page-number">`).
- **E6S2** (P2) As a **user**, I want print preview to show headers/footers, so I trust the printed copy.
  Acceptance: print stylesheet renders header/footer on every printed page.
- **E6S3** (P2) As a **user**, I want export to preserve editorial markers (comments, track-changes, bookmarks, cross-refs), so nothing is silently lost.
  Acceptance: export tests reuse the conformance contracts (`test_onlyoffice_conformance.py`).

## E7 — Administration & operations
Status: 🔶 (health endpoint, structured logs, runbook) · Priority: P1 · Sources: `plan/operations-runbook.md`, `plan/specs/admin-pages.md`, `plan/specs/seaweedfs-storage.md`
- **E7S1** (P1) As an **admin**, I want a document inventory with storage/access stats, so I can see what’s hosted.
  Acceptance: read-only admin route listing store contents + sizes (Stoic: a page, not a SPA).
- **E7S2** (P1) As an **admin**, I want quotas and retention rules, so growth stays bounded.
  Acceptance: per-host quota enforced at PutFile; retention purges to trash.
- **E7S3** (P2) As an **admin**, I want backup/restore of the SQLite ledger and blobs (incl. S3/SeaweedFS), so I can rebuild after loss.
  Acceptance: `backup` + `restore` commands round-trip a fixture store.
- **E7S4** (P2) As an **operator**, I want alerts on lock-stalls and repeated convert failures, so I fix issues before users notice.
  Acceptance: structured JSON log events + configurable threshold hooks.
- **E7S5** (P2) As an **admin**, I want an audit log of document opens/saves, so I can review access.
  Acceptance: append-only audit records with host/user/id/timestamp.

## E8 — Writing assistance
Status: 🔶 (spellcheck `spellcheck` attribute, find-replace, word count) · Priority: P2 · Source: `plan/specs/spellchecker.md`, `plan/specs/ai-integration.md`
- **E8S1** (P2) As a **writer**, I want inline spelling/grammar underlines with suggestions, so my text is clean.
  Acceptance: backend suggestion API; accents/case handled (Hungarian-aware was part of the old wo-spell scope).
- **E8S2** (P2) As a **writer**, I want advanced find-replace (whole-word, match-case, regex, replace-all), so editing is fast.
  Acceptance: current find dialog gains options; state survives focus restore.
- **E8S3** (P2) As a **user**, I want live selection word/character count, so I can hit length targets.
  Acceptance: status bar updates on selection (already live for full-doc count).
- **E8S4** (P2) As a **teacher**, I want writing suggestions grounded in the document, so help is relevant.
  Acceptance: gated AI completion endpoint; nothing leaves the server without explicit consent (Stoic gating).

## E9 — Knowledge & AI integration
Status: 🔲 (T33 was deemed infeasible: repo not cloned locally) · Priority: P2 · Sources: `plan/specs/ai-integration.md`, `plan/specs/mcp-server.md`, T33 chemie-neo4j
- **E9S1** (P2) As a **researcher**, I want to push a finished document into the chemie knowledge graph, so it becomes searchable/semantic.
  Acceptance: export hook delivers document text + structure to chemie-lernen.org ingest API.
- **E9S2** (P2) As a **student**, I want to ask questions answered from my documents, so revision is targeted.
  Acceptance: Q&A endpoint retrieves passages linked to source documents.
- **E9S3** (P2) As an **agent**, I want to create/edit documents over MCP, so my other tools can use the editor.
  Acceptance: MCP server routes to docserver write endpoints with same auth.

## E10 — OpenCloud lifecycle & sharing
Status: 🔶 (WOPI host mode, save-back, lock/unlock) · Priority: P1 · Source: `plan/specs/opencloud-integration/`, `plan/specs/mobile-responsive/`
- **E10S1** (P1) As a **user**, I want view-vs-edit sharing enforced, so shared links respect permissions.
  Acceptance: read-only link opens editor in RO mode (`protect` handshake); edit link requires token.
- **E10S2** (P1) As a **user**, I want rename/move/delete in OCIS to stay in sync with the docserver ledger.
  Acceptance: WOPI rename/move/delete round-trip; stale store entries cleaned.
- **E10S3** (P1) As a **user**, I want clean WOPI locking with auto-refresh and takeover, so two editors don’t clobber each other.
  Acceptance: lock refresh loop + expired-lock takeover (extends `tests/test_wopi.py`).
- **E10S4** (P2) As a **mobile user**, I want to edit on a phone, so I can review anywhere.
  Acceptance: responsive layout at 360px; touch targets ≥ 44px; toolbar collapses.
- **E10S5** (P2) As a **user**, I want saves to land in OCIS as new versions, so the host keeps history.
  Acceptance: version bump per PutFile visible in OCIS file version list.

## E11 — Reliability & security hardening
Status: 🔶 (JWT auth, sanitizer, lock state tests) · Priority: P1 · Source: `plan/specs/cross-cutting-concerns.md`
- **E11S1** (P1) As an **operator**, I want the server to survive restarts without corrupting documents.
  Acceptance: crash-restart test leaves store consistent; half-written blobs recoverable.
- **E11S2** (P1) As a **user**, I want my document free of script injection no matter what I paste.
  Acceptance: sanitizer fuzz (`test_structured_fuzz_never_crashes_converters` style) upholds `_safe_tags` allowlist under Hypothesis.
- **E11S3** (P2) As an **admin**, I want JWT token expiry/rotation enforced, so leaked tokens fade quickly.
  Acceptance: auth tests assert 401 on expired token; rotation path covered.
- **E11S4** (P2) As an **operator**, I want the server responsive under load, so editing stays snappy.
  Acceptance: `tests/bench/` benchmarks stay within budget; no unbounded queues.

## E12 — Conformance & fidelity confidence
Status: 🔶 (30-docx corpus, 27 ONLYOFFICE-conformance cases, LibreOffice differential, Hypothesis property/fuzz) · Priority: P1
This epic carries the **SOTA testing methods** already landed and grows them.

- **E12S1** (P1) As a **developer**, I want ODT conformance quality equal to DOCX, so parity is provable.
  Acceptance: an ODT corpus alongside the docx corpus with the same round-trip + differential harness.
- **E12S2** (P1) As a **developer**, I want LibreOffice-oracle differential coverage over fixtures LibreOffice generates, so foreign-file reads are guarded.
  Acceptance: LO-produced feature fixtures (bookmarks, comments, tracked changes) feed `test_converter_differential.py`.
- **E12S3** (P2) As a **developer**, I want automated mutation testing in CI, so the suite’s teeth are verified continuously.
  Acceptance: a mutation sweep (drop author, drop bookmark name, drop w:id) is run and each mutant fails.
- **E12S4** (P2) As a **developer**, I want the full WOPI flow in CI against OCIS, so host-mode regressions are caught early.
  Acceptance: `tests/e2e/` runs on a disposable OCIS stack in CI (source: `e2e-test-infrastructure`).

---

## Deliberately out of scope (Stoic rejections — for discussion before any of these become epics)

Per §7 of `RETHINK_WORLD_OFFICE.md` (apply to every merge): if it doesn’t serve
“edit office documents through OpenCloud”, reject it.

- **Desktop app / Tauri** — adds a packaging matrix with no OCIS value.
- **Plugin ecosystem** — the plugin-SDK cathedral is the anti-pattern we removed.
- **Canvas rendering** — DOCX↔HTML + contenteditable is the chosen 90% solution.
- **XLSX/PPTX editing** — out of the “one job” (documents); read-only preview if ever.
- **Multi-tenant SaaS / k8s** — single Docker image + systemd is the target shape.
- **PostgreSQL before SQLite is measured slow** — temperance: no caching/daemons before a measured need.

---

## Backlog → change workflow

1. Pick a story; write its spec fragment (requirement + scenarios) in OpenSpec “Requirement” form.
2. Create `openspec/changes/<name>/` with `design.md`, `specs/…/spec.md`, `tasks.md`.
3. Gate: `uv run --extra dev pytest tests/ --ignore=tests/e2e` + `uv run ruff check src tests` + `node --check` on JS.
4. Ship via private branch → `merge --no-ff` → push (fleet-safe discipline).
