# 09 — Architectural Decisions

> arc42 §9 · ADRs for the Rust cloud & AI platform (R-series) and frontend
> (F-series), newest first.
> **Revision:** 2026-11-25 · Status: ✅ implemented (as reference) · 🔶 partially ·
> superseded-by noted

---

## ADR-F1 · Editor chrome: Rust → wasm with Leptos

- **Status:** ✅ decided for the PoC — 🔶 production migration not started
- **Context:** Editor chrome is ≈39 k LOC React/TypeScript (packages/editor-
  common/src/ribbon/* + apps/web/apps/documenteditor-react), inherited via
  OO-clone → Python rewrite → a 2026 react-port. React was *never* chosen by
  ADR; the build ships 17.30 MB (JS 13.59 MB incl. Monaco 9.9 MB + TipTap +
  wasm 3.46 MB). Ribbon parity gate: ONLYOFFICE golden Home tab is 2 rows / 12
  groups; current World-Office ribbon regressed to 4 rows / 25 groups
  (wo-test-harness/census/layout-diff.py). The editing engine is already Rust
  → wasm (core/crates/wo-renderer-wasm, ≈45 exports). PoC
  apps/web/apps/ribbon-leptos (Leptos 0.8.23 + trunk 0.22.2) proves the
  ribbon can be rendered by Rust/wasm with the same wasm-bindgen toolchain as
  the engine (engine pins 0.2.118; PoC uses 0.2.130 — merged workspace needs
  `[tools] wasm-bindgen = "0.2.118"` in Trunk.toml). MEASUREMENTS.md records
  the PoC numbers: baseline scaffold wasm 145182 B raw / 58168 B gzip + JS
  29967 B raw / 6192 B gzip (whole UI runtime ≈64 KB gzip) vs 1.04 MB vendor
  JS chunk in React build; Leptos PoC: wasm 196248 B raw / 77143 B gzip + JS
  33650 B raw / 6627 B gzip; layout parity: OO 2 rows/12 groups vs WO 2
  rows/8 groups → LAYOUT_OK=1 (PASS). IME: Rust/wasm UI receives composition
  ONLY via a real editable element; PoC's hidden <textarea> bridge passed a
  full composition session (Chrome DevTools Protocol: Input.imeSetComposition
  / Input.insertText produced 'にほん' mid-composition, committed '日本語');
  synthetic DOM events cannot do this.
- **Decision:** Adopt Leptos (Rust → wasm, real DOM + CSS) as the target for the
  editor chrome; keep core/crates/*, wo-renderer-wasm and docserver unchanged;
  replace React chrome incrementally (ribbon first, then dialogs/panels, then
  canvas host) with a hidden textarea/contenteditable bridge as a permanent
  component for IME and caret. Assessed options from docs only (not
  prototyped): keep React/TS (two live editing engines, ≈9.9 MB Monaco,
  39 k LOC chrome, ribbon 4 rows vs 2); egui 0.37 (immediate-mode, paints
  own pixels to canvas via WebGL/wgpu — no DOM/CSS so parity gate cannot
  score it; IME needs same hidden-textarea bridge); Yew 0.23 (virtual-DOM,
  React-like, CSR/SSR by Cargo features); Dioxus 0.1 (RSX + hooks, virtual
  DOM, React-like); Slint 1.19 (desktop-first, own markup/renderers, web via
  WebGL/Canvas2D — not DOM); iced 0.14 (Elm architecture, wgpu/web
  renderers — not DOM).
- **Consequences:** FOR — one language/toolchain end-to-end for UI + engine;
  UI runtime tens of KB instead of MB of vendor JS; ribbon geometry lives in
  CSS and is gated against ONLYOFFICE golden; Monaco/TipTap duplication
  disappears once hosts are ported; no JS build toolchain for UI. AGAINST —
  rewrite ≈39 k LOC React (dialogs, Monaco-based command field); Leptos 0.8 →
  0.9 API churn risk; smaller talent pool; accessibility and IME depend on
  hidden-textarea bridge; parity must be re-proven tab by tab. Supersedes
  ADR-R9 for the editor UI and records the unrecorded React choice as
  superseded.
- **Cross-ref:** apps/web/apps/ribbon-leptos/README.md and MEASUREMENTS.md;
  wo-test-harness/census/layout-diff.py; core/crates/wo-renderer-wasm;
  packages/editor-common/src/ribbon/specs/word-ribbon.ts; ADR-R9; af
  campaign config/leptos1.

## ADR-R9 · The entire stack is superseded by the Stoic Python rewrite

- **Status:** ✅ decided 2026-08-19 (outcome recorded here)
- **Decision:** no new cloud/AI work on the Rust platform; the canonical
  product is `server-py` (FastAPI docserver + OCIS). The Rust stack remains
  as **reference** for migration/enterprise.
- **Cross-ref:** Python arc42 ADR-001 (discard cathedral), ADR-007 (agentic
  control plane).

## ADR-R1 · axum + tokio + tracing for all Rust services

- **Status:** ✅
- **Context:** 8 microservices needed a uniform async web stack with
  observability.
- **Decision:** single-stack rule: axum (routing) + tokio (async) + tracing
  (logs/spans) everywhere.
- **Consequences:** uniform conventions; `RUST_LOG` + Tempo traces for free.

## ADR-R2 · Storage = SQLite metadata + disk blobs

- **Status:** ✅
- **Context:** file service must be simple and self-hosted.
- **Decision:** `files` table metadata + blob files on disk; REST CRUD;
  no DB server, no object store.
- **Consequences:** only storage service reached "fully implemented" status;
  easy ops, tiny footprint.

## ADR-R3 · CRDT collaboration via diamond-types `ListCRDT`

- **Status:** ✅
- **Context:** real-time co-editing must converge without an OT server.
- **Decision:** use the mature `diamond-types` CRDT in
  `coauthoring-service`; WebSockets for transport; SQLite for session
  metadata; ephemeral broadcast channels.
- **Consequences:** convergence delegated to a proven library; presence +
  annotations layered on top. (Python rewrite later hand-rolled its own RGA
  — different substrate, same rationale.)

## ADR-R4 · MCP via `rmcp` + REST mirror + plugin child processes

- **Status:** ✅
- **Context:** AI agents need an open, tool-based protocol; plugins should
  be third-party-loadable.
- **Decision:** implement `rmcp` server trait with 14 built-in tools;
  mirror as HTTP REST (`/api/tools`, `/api/tools/:name/call`) for
  browser clients; spawn plugin tool servers as isolated child processes
  from `MCP_PLUGIN_CONFIG`.
- **Consequences:** agents + browsers share one tool surface; isolation for
  untrusted plugins.

## ADR-R5 · AI chat = config-managed passthrough proxy (POST/response)

- **Status:** ✅ (2026-06-26 actual implementation; original SSE-engine spec rejected)
- **Context:** the original spec proposed 13 provider classes + SSE
  streaming; that was over-engineered for the need.
- **Decision:** `/docservice/ai` forwards the client's request
  {url, method, body, headers} to any configured provider; providers
  managed via `GET/PUT /admin/api/v1/ai/providers`; keys masked in
  responses; settings: timeout/CORS/proxy URL.
- **Consequences:** tiny, simple, vendor-agnostic; no streaming UX.
  (Superseded for agents by the Python AgentRunner + MCP-stdio.)

## ADR-R6 · Retain the OnlyOffice-derived Node.js document server

- **Status:** ✅ (then) / 🔶 (now reference)
- **Context:** the docservice surface (DocBuilder conversion + AdminPanel)
  was large and OnlyOffice-compatible.
- **Decision:** keep `services/server` (Node.js, 189 files) alongside Rust —
  an acknowledged polyglot exception with its own linting/CI.
- **Consequences:** richer docservice features; the only Node.js surface in
  a Rust cloud; removed for good in the Python rewrite.

## ADR-R7 · Nightly Rust in CI (stable ICE workaround)

- **Status:** ✅
- **Context:** stable 1.94.1 hits an internal compiler error on
  `wo-pdf`/`wo-webdav`.
- **Decision:** `rust-toolchain.toml` = nightly for CI; stable for releases;
  wo-pdf/wo-webdav excluded from fmt/clippy on stable.
- **Consequences:** works, but a recurring friction point (an input to
  ADR-R9's rewrite).

## ADR-R8 · Protocol crates as standalone libraries (wo-wopi, wo-webdav)

- **Status:** ✅
- **Context:** WOPI/WebDAV contracts should be testable independently and
  reusable by web/desktop/services.
- **Decision:** `wo-wopi` (handlers/models/server/storage) and `wo-webdav`
  as crates; `wo-docserver` is a thin service wiring wo-wopi to
  `WOPI_HOST_URL`.
- **Consequences:** protocol logic unit-testable; the docserver stays thin.
