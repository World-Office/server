# 12 — Glossary

> arc42 §12 · Terms used across the Rust cloud & AI documentation.
> **Revision:** 2026-09-05 · Status: reference

| Term | Meaning |
|------|---------|
| **axum** | Rust web framework (tokio-based) used by every Rust service. |
| **tokio** | Rust async runtime underneath axum, used for WebSockets and HTTP. |
| **tracing** | Rust observability crate: spans/logs; `RUST_LOG` controls verbosity; feeds Loki/Tempo. |
| **rmcp** | Rust implementation crate of the Model Context Protocol used by `mcp-server`. |
| **MCP (Model Context Protocol)** | Open protocol (Anthropic) for exposing tools to AI agents; JSON-RPC 2.0 based. |
| **MCP tool** | A named callable with a JSON input schema exposed to agents. |
| **Plugin tool server** | A third-party MCP server spawned as a child process by mcp-server (`MCP_PLUGIN_CONFIG`), isolated from the host process. |
| **Storage boundary** | The rule that MCP tools and services only touch documents through the storage-service HTTP API (no direct DB). |
| **diamond-types** | CRDT library (ListCRDT) used by the coauthoring service for text/slide ops. |
| **CRDT / ListCRDT** | Conflict-free Replicated Data Type / sequence CRDT — converges without a central ordering service. |
| **coauthoring session** | A collaboration unit: UUID, participants (with colors), WS URL; metadata in SQLite, channels ephemeral. |
| **DocBuilder** | Node.js CLI document conversion tool inside `services/server`. |
| **AdminPanel** | TypeScript admin app served by the Node docservice; hosts the AI chat/providers/settings UI. |
| **Passthrough proxy** | `/docservice/ai` forwards the client's {url, method, body, headers} to the configured AI provider; POST/response, no SSE. |
| **SSE** | Server-Sent Events — considered for AI streaming and rejected in favor of simple POST/response. |
| **Provider config** | `aiSettings.providers/.customProviders/.actions/.models` — runtime-config-managed AI settings; keys masked in APIs. |
| **JWT** | JSON Web Token issued by identity-service, verified by the gateway (`JWT_SECRET` shared). |
| **OAuth2** | Authorization framework supported by identity-service. |
| **WOPI** | Web Application Open Platform Interface — editing contract with OpenCloud; implemented by `wo-wopi`/`wo-docserver`. |
| **WebDAV** | File access protocol implemented by the `wo-webdav` crate. |
| **wo-x2t** | Format-conversion crate used by the conversion-service. |
| **wo-route** | Connector-routing crate (Visio-style) — geometry, not cloud; listed for completeness. |
| **storage-service** | SQLite metadata + disk blobs; the fully-implemented file store of the cloud. |
| **api-gateway** | Single public entry point (:8080): JWT check, CORS, upstream routing (8001–8005). |
| **Observability stack** | Prometheus (/metrics) + Grafana (dashboards) + Loki (logs) + Tempo (traces). |
| **services.Dockerfile** | Dockerfile that builds any Rust service via `SERVICE_NAME` ARG (CI matrix). |
| **nightly / stable ICE** | Rust nightly required in CI; stable 1.94.1 hits an internal compiler error on wo-pdf/wo-webdav (ADR-R7). |
| **Biome / Turbo / pnpm** | TypeScript lint (Biome), task orchestration (Turbo), package manager (pnpm) for the frontend. |
| **Reference/deprecated** | Status of this stack since 2026-08-19; canonical product = Python docserver (`server-py`). |
| **Cross-ref (Python set)** | Terminology like CRDT, WOPI, JWT, MCP also exists in `server-py/docs/arc42/12-glossary.md`; this page covers Rust-specific terms. |
