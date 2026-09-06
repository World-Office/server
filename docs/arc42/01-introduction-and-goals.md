# 01 — Introduction & Goals

> arc42 §1 · Requirements Overview / Goals / Stakeholders — **Rust Cloud & AI Platform** (reference stack)
> **Revision:** 2026-09-05 · Status: reference/deprecated (canonical = `server-py`, see that set's arc42)

## 1.1 Requirements Overview

The Rust stack of World-Office is a **self-hosted cloud document platform**:
a set of Rust microservices that together provide identity, storage,
conversion, real-time collaboration, and an API gateway for browser editors,
plus **AI integration surfaces** — a Rust **MCP (Model Context Protocol)
server** exposing document operations to AI agents, and an **admin-panel AI
proxy** for chat-driven assistance.

> ⚠️ This is the **implemented** architecture of the stack that was
> superseded on 2026-08-19 by the Stoic Python rewrite
> (`server/opencloud-docserver/`). These pages are the authoritative record
> of how the Rust cloud+AI layer was designed and built — kept for
> reference, migration, and enterprise-history purposes. New work belongs in
> the Python docserver.

Cloud-scope in this set:

- **API gateway** (`api-gateway`) — single entry point, request routing, CORS.
- **Identity & sessions** (`identity-service`, `session-service`) — JWT +
  OAuth2 authentication, session lifecycle.
- **Storage** (`storage-service`) — SQLite metadata + disk blob content;
  the most complete service (full `/files` REST CRUD).
- **Conversion** (`conversion-service`) — document format conversion backed
  by the `wo-x2t` crate.
- **Coauthoring** (`coauthoring-service`) — real-time CRDT collaboration
  over WebSockets (`diamond-types`).
- **WOPI docserver** (`wo-docserver`) — WOPI protocol server connecting to
  OpenCloud/OCIS as host.

AI-scope in this set:

- **Rust MCP server** (`services/mcp-server`) — 14 built-in tools
  (document CRUD, version snapshots, comments, mentions, cross-document
  links) over `rmcp`, plus a plugin system for third-party MCP tool servers
  and an HTTP REST mirror.
- **Admin-panel AI** (`services/server` Node module + `admin-panel` TS app)
  — provider-managed chat proxy (`POST /docservice/ai`) with configurable
  providers, models, actions.

Explicitly **out of the cloud+AI focus** (referenced only): the 16 format
parser crates, Tauri desktop shell, and the TypeScript editors.

## 1.2 Goals

| Goal | Meaning (as designed) | Evidence |
|------|------------------------|----------|
| **G1 · Cloud-native microservice architecture** | Bounded, individually deployable services around a gateway | 8 Rust services + Node docserver + admin panel; `docker-compose.services.yml` |
| **G2 · Real-time collaboration correctness** | Conflict-free concurrent editing | `diamond-types` CRDT, WebSocket `/ws/{session_id}`, presence/comments |
| **G3 · AI integration via open protocol** | Agents operate on documents through MCP, not proprietary APIs | `services/mcp-server` (rmcp), 14 tools, plugin child-process isolation |
| **G4 · Ops visibility** | Metrics, logs, traces out of the box | **Observability**: Prometheus + Grafana + Loki + Tempo; `/metrics` + `/health` on every service |
| **G5 · Standards-based interop** | WOPI/WebDAV as the document protocol layer | `wo-wopi`, `wo-webdav` crates; docserver ↔ OCIS |
| **G6 · (History) Product capability breadth** | Full office suite breadth (all formats + editors) | 26 core crates, web apps — the ambition the rewrite later narrowed |

## 1.3 Stakeholders (of the Rust stack)

| Role | Interest |
|------|----------|
| End users (document authors) | Edit many formats in the browser; collaborate; AI-assisted writing |
| Operators | Simple-ish compose deployment, full observability |
| AI tool builders | MCP tools + plugin server isolation; admin AI provider config |
| Maintainers | Reference/record; enterprise editions (`core-enterprise`, `services-enterprise`) |
| OpenCloud integration | WOPI docserver behavior vs OCIS |

## 1.4 State of the stack

- Storage service: complete CRUD + 7 repository unit tests (the "fully
  implemented" benchmark of the cloud layer).
- Coauthoring: CRDT + WebSockets implemented per `plan/specs/collaboration/`.
- MCP server: tools + REST mirror + plugin loading per `plan/specs/mcp-server/`.
- AI admin: actual simpler implementation than the original spec (POST/response
  passthrough proxy; config-managed providers — see `plan/specs/ai-integration.md`).
- Overall: **deprecated in favor of the Python Stoic rewrite** (2026-08-19).
