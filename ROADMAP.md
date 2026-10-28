# World-Office Roadmap

**Rewritten:** 2026-10-27 (replaces the 2026-06-23 version, which predated the
parity program and the ledger and claimed "all features done").
**Basis of truth:** the feature ledger (`wo-test-harness/census/ledger/`) —
239 rows scored L0–L4, re-scored against the live prod editor.
**Architecture docs:** `../docs/arc42/` (workspace) + `wo-test-harness/docs/arc42/`.

---

## Where we are (2026-10-27)

- **Surface parity: 231/239 (96.7%)** — L1 211 · L3 20 · L0 8.
- **Persistence: 13/13 round-trip commands survive html→docx→html verbatim**
  (all harness workarounds retired; converter gates 10/10; wo-html 112 /
  wo-ooxml 66 / wo-x2t 438 green).
- **Production:** Rust docserver live behind `editor.cloud.graphwiz.ai`
  (OpenCloud/WOPI), staging mirror on :8086, zero pageerrors.
- Parity arc: deficit 152 → structurally 0 (2026-10-25), bug hunts BUG1–9,
  chrome/gray-void fixes, LEDGER3 true-gap campaigns, LEDGER2 converter
  fidelity wall — all closed, deployed, live-verified.

---

## Phase 0 — Close the ledger (the 8 real L0 rows)

- [ ] **`insert.insert-spreadsheet`** — embed spreadsheet object into doc
      (Insert ▾). Own task; largest item here.
- [ ] **`references.dlg-bookmarks`** — bookmarks dialog (insert/goto/delete).
- [ ] **`plugins.plugin-manager`** — plugin manager UI on top of the existing
      plugin-sdk package.
- [ ] **`statusbar.btn-doc-spell`** — statusbar spell-check toggle button
      (engine is live; only the toggle control is missing).
- [ ] **Backstage sections decision** — OO's File-screen left rail has
      Home/Layout/References/Collaboration sections (`file.home`,
      `file.layout`, `file.references`, `file.collaboration`); WO backstage
      is menu-shaped (Info/History/Settings/Protect). Decide: adopt OO's
      sectioned backstage, or declare divergence loudly in the ledger and
      register (`divergence:` rows). One decision closes 4 rows honestly.

**Acceptance:** ledger re-score L0 ≤ 4 (or all 8 closed/diverged);
roundtrip gates stay 13/13.

## Phase 1 — Converter residuals & documented ceilings

- [ ] `w:sdt` docx emitter (structured document tags / content controls —
      see `../plan/CONTENT_CONTROLS.md`).
- [ ] `textDirection` in wo-ooxml (parse + serialize).
- [ ] List `start` value emission in numbering.xml (ceiling today).
- [ ] `ilvl` nesting depth (flattened today — round-trips as flat list).
- [ ] Export-to-file expansion of Download As (formats beyond docx/html/pdf).
- [ ] Chart 3D depth rendering.
- [ ] Optional: deep census of OO Home-tab dialogs (completes dialog
      inventory for the formatting cluster).

## Phase 2 — Measurement depth (harness)

- [ ] L2 behavior-probe coverage parity with L1 (fx covers 108 controls;
      extend to dialog-level probes).
- [ ] L4 fidelity scoring beyond docx rendering (sheet/slide conformance).
- [ ] Deep/dialog census for React editors (word-only today) and for
      sheet/slide/pdf/visio apps.
- [ ] Consolidate the ~30 point-probe `.cjs` scripts into the reconcile flow
      where they've become permanent gates.

## Phase 3 — Release engineering v1.0.0

- [ ] Tag v1.0.0 with changelog from conventional commits.
- [ ] Release checklist: `cargo test --workspace` → `pnpm typecheck` →
      tag → publish (doc-only CI-skip stays).
- [ ] Publish `.deb`/`.AppImage`/`.rpm` desktop builds (repo on Codeberg
      Pages; Tauri PoC → product).
- [ ] Optional: crates.io for reusable library crates (wo-common, wo-odf,
      wo-fonts, wo-renderer).
- [ ] Split `wo-docserver/src/lib.rs` (113 KB) into modules before adding
      further surfaces (AI, collab, editor-docs want their own).

## Phase 4 — Desktop & mobile

- macOS (.dmg) and Windows (.msi) Tauri builds + signing; CI pipelines.
- Android: audit `integrations/android/`, Tauri mobile target, touch editor
  (gestures), SAF file picker.
- Offline editing: Service Worker asset cache, IndexedDB autosave +
  conflict detection, offline indicator.
- iOS later (TestFlight path documented in old roadmap, git history).

## Phase 5 — Ecosystem & enterprise

- Plugin ecosystem: manifest spec, sandboxed runtime, plugin store,
  developer docs (plugin-sdk exists; manager UI is Phase 0).
- Enterprise services (private repo): audit / SCIM / webhooks deployment,
  SSO/SAML/OIDC in identity-service.
- Self-host story: Helm chart, backup/restore docs, migration guide from
  ONLYOFF/Collabora.
- i18n completion (RTL, CJK fallback, translation platform).
- Performance: WASM bundle budget, spreadsheet virtual scrolling, per-type
  lazy editor loading, `cargo bench` suite.

## Continuous (not phased)

- Weekly security audits (cargo + pnpm) — running.
- Ops runbook maintenance (`../plan/operations-runbook.md`).
- Prod pageerror sweep + roundtrip probe after every deploy — standing rule.
- Keep AGENTS.md / arc42 docs current with reality (they are the onboarding
  path for agents and humans).

---

## Verification commands (how "done" is proven)

```sh
# ledger re-score (against live prod editor)
cd wo-test-harness/census && /usr/bin/python3 ledger/build.py
# persistence gate
cd wo-test-harness/census/ledger && NO_PROXY='127.0.0.1,localhost' \
  WO_CONVERT_URL=http://127.0.0.1:18087/api/conversion/convert \
  /usr/bin/node roundtrip.cjs        # expect: 13/13 survived
# full parity gate
WO_SERVER_DIR=../server /usr/bin/python3 census/reconcile.py \
  --check --seed-check --interactions --fx --geometry --visual --ai
```
