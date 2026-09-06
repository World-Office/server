# 08 — Cross-cutting Concepts

> arc42 §8 · Concepts spanning the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 8.1 Security

| Concept | Mechanism |
|---------|-----------|
| **Authentication** | JWT issued by `identity-service` (JWT + OAuth2); `JWT_SECRET` shared across gateway+services; gateway validates on every routed request |
| **WOPI safety** | docserver never exposes WOPI endpoints without token validation (hard anti-pattern rule) |
| **AI key handling** | Provider/API keys stored in runtime config; **masked** (`"••••••"`) in all API responses; keys forward only inside the passthrough proxy payload |
| **CORS** | `tower-http` CORS on the gateway/docserver; `ALLOWED_ORIGIN`-style config per origin |
| **Plugin isolation** | MCP plugins run as **separate child processes** (stdio MCP), loaded from `MCP_PLUGIN_CONFIG` — untrusted tool servers cannot run in-process |

## 8.2 Persistence & state

- **storage-service**: SQLite metadata + disk blobs — the canonical file
  store of the cloud.
- **coauthoring-service**: SQLite for session metadata (durable), broadcast
  channels ephemeral (no durable chat/op log across restarts).
- **session-service**: session records (SQLite/Redis by deployment).
- **mcp-server**: stateless (stateless tools); `snapshots.rs` writes
  version images through storage-service.
- No database server required anywhere (constraint C-R-TEC-7).

## 8.3 Networking & process model

- All Rust services: `axum` + `tokio` (async); `tracing` spans propagate
  `trace_id` to Tempo.
- Gateway as the only public HTTP entry (except docserver and mcp-server
  REST, which have dedicated consumers: OCIS / agents).
- WebSockets only at the coauthoring service (`/ws/{id}`).

## 8.4 Error handling & protocol conventions

- REST: standard status codes; `is_error`/typed `ContentItem` in MCP tool
  responses; 400 unknown tool, `is_error:true` tool failure (MCP errors as
  results; transport errors as JSON-RPC errors).
- Logging: `RUST_LOG` leveled, stdout; shipped to Loki.

## 8.5 AI cross-cutting

- **One contract, two carriers**: the MCP tool surface (rmcp) and the REST
  mirror expose the *same* 14 tools; the admin AI is a separate, simpler
  chat proxy.
- **No vendor lock**: providers are URLs + keys in config — swap OpenAI,
  Claude, local servers without code change; chat is passthrough
  (POST/response).
- **Attribution/safety**: (as implemented) no op-level attribution plane in
  the Rust cloud — that capability arrived with the CRDT control plane in
  the Python rewrite (see Python set §4.6 / ADR-007). AI writes here are
  direct storage writes with version snapshots as the safety net.

## 8.6 Frontend / admin cross-cutting

- Admin panel (TypeScript): AiChat / AiProviders / AiSettings pages call
  `/docservice/ai` and `/admin/api/v1/ai/*`; no SSE hook (simple fetch).
- Editors: React-based, reach services only through the gateway.

## 8.7 Build & test concept

- `cargo build/test/clippy/fmt --workspace` (nightly); WASM crates exempt
  from `cargo test` (browser/wasm-pack instead).
- `pnpm test/lint/typecheck` (Biome + Turbo); E2E: Jest + Playwright against
  the Docker stack; doc-only and artwork-only changes skip CI.
- CI caching: shared Cargo registry, persisted Turbo cache, BuildKit layer
  caching; auto-cancel stale runs.
