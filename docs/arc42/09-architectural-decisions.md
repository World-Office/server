# 09 — Architectural Decisions

> arc42 §9 · ADRs for the Rust cloud & AI platform (R-series), newest first.
> **Revision:** 2026-09-05 · Status: ✅ implemented (as reference) · 🔶 partially · superseded-by noted

---

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
