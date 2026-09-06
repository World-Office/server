# World-Office (Rust) — Cloud & AI Platform — arc42 Documentation

> **System:** World-Office Rust Cloud & AI Platform (`server/` — services, core crates, Node docserver)
> **Status:** ⚠️ **REFERENCE / DEPRECATED as product roadmap.** The canonical product is the Stoic Python
> rewrite at `server/opencloud-docserver/` (see `server-py/docs/arc42/`). This set documents the **Rust
> cloud + AI architecture as it was implemented** — kept as the authoritative record of that stack.
> **Format:** [arc42](https://arc42.org) — one document per section, plus this index. **Focus:** cloud + AI.

This documentation deliberately **focuses on the cloud and AI layers** of the Rust stack: the
microservices, the Node.js document server, the admin panel AI integration, and the Rust MCP server.
The 16 format-parser crates and the TypeScript editor apps are only referenced where they serve cloud
or AI concerns (e.g. `wo-x2t` behind the conversion service). See `README.md` of the Python set for the
canonical direction and lineage.

## Document map

| # | Section | Module | TL;DR |
|---|---------|--------|-------|
| 01 | [Introduction & Goals](01-introduction-and-goals.md) | Requirements | Cloud editor platform goals; AI integration goals; status as reference stack. |
| 02 | [Architecture Constraints](02-architecture-constraints.md) | Constraints | Rust 2024/axum+tokio, dedicated services, Node.js exception, WOPI/WebDAV standards, licensing. |
| 03 | [Context & Scope](03-context-and-scope.md) | Context | Gateway-everything topology; MCP clients; OCIS/WOPI host; in/out of scope (cloud+AI focus). |
| 04 | [Solution Strategy](04-solution-strategy.md) | Strategy | Microservice decomposition, format crates as libraries, CRDT collab, MCP via `rmcp`, AI passthrough proxy. |
| 05 | [Building Block View](05-building-block-view.md) | Building blocks | api-gateway, identity, session, storage, conversion, coauthoring, mcp-server, Node docserver, admin-panel. |
| 06 | [Runtime View](06-runtime-view.md) | Runtime | Scenarios: gateway routing+auth, storage CRUD, conversion, WebSocket collab, MCP agent call, AI chat proxy. |
| 07 | [Deployment View](07-deployment-view.md) | Deployment | `docker-compose.services.yml` topology, ports, observability stack (Grafana/Prometheus/Loki/Tempo), CI. |
| 08 | [Cross-cutting Concepts](08-cross-cutting-concepts.md) | Cross-cutting | JWT/OAuth2 auth, tower-http CORS, tracing, persistence patterns, AI provider config, security anti-patterns. |
| 09 | [Architectural Decisions](09-architectural-decisions.md) | Decisions | ADR-R1…R9 — axum+tokio, SQLite+blob storage, diamond-types CRDT, rmcp, AI passthrough proxy, Node server. |
| 10 | [Quality Requirements](10-quality-requirements.md) | Quality | Quality tree + scenarios for the cloud platform and AI service; CI/tracing evidence. |
| 11 | [Technical Risks](11-technical-risks.md) | Risks | Deprecation/bit-rot, AI key handling, CRDT convergence, nightly toolchain, service sprawl. |
| 12 | [Glossary](12-glossary.md) | Glossary | axum, tokio, rmcp, diamond-types, MCP, DocBuilder, passthrough proxy, SSE, … |

## Conventions

- Paths are relative to `server/`.
- The canonical (Python) set lives at `server-py/docs/arc42/`; cross-references point there.
- ASCII diagrams preferred; Mermaid only where it aids the reader.
