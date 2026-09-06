# 03 — Context & Scope

> arc42 §3 · Context and scope of the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 3.1 Business context

The Rust platform ran the full "cloud office" product: browsers open many
editor apps, all traffic flows through an API gateway to backend services;
documents are created, stored, converted and collaboratively edited; the
admin panel configures an **AI assistant** for chat support. Additionally,
a WOPI **docserver** bridges to OpenCloud (OCIS) as the file host.

```
  Browser (editor apps / admin panel)          AI agent clients (MCP)
                │                                        │
      ┌─────────▼─────────┐              ┌───────────────▼──────────────┐
      │   api-gateway      │              │   mcp-server (Rust, rmcp)    │
      │   (auth, routing,  │              │   14 built-in tools +        │
      │    CORS)           │              │   plugin child processes     │
      └──┬────┬────┬────┬──┘              └──────────────┬──────────────┘
         │    │    │    │                                 │  HTTP API (REST mirror)
    ┌────▼┐ ┌▼────┐┌▼────┐  ┌─────────────────────────────┘
    │id   │ │stor ││conv │  │
    └────┬┘ └┬────┘└┬────┘  ┌───────────────────────────────┐
         │   │   ┌──▼──────┐│  Node docserver (services/server)│
         │   │   │coauthor ││  - DocBuilder CLI               │
         │   │   └─────────┘│  - AdminPanel (/docservice/ai)  │
         │   │   session    │  - provider config              │
         │   │              └───────────────┬────────────────┘
         │   │                              │ POST /docservice/ai (passthrough)
         │   │                   ┌──────────▼──────────┐
         │   │                   │  External AI vendors │ (OpenAI, Claude, local…)
         │   │                   └─────────────────────┘
         │   └────────── wopi docserver (wo-docserver) ──► OpenCloud (OCIS)
         └────────── (WebDAV via wo-webdav) ─────────────────────┘
```

## 3.2 Technical context — neighbors and contracts

| Neighbor | Protocol | Notes |
|----------|----------|-------|
| Browser editors / admin panel | HTTP/JSON via **api-gateway :8080** | JWT-protected; `JWT_SECRET` shared |
| Coauthoring clients | REST `/sessions` + **WebSocket `/ws/{id}`** | diamond-types CRDT ops |
| AI agents (Claude/GPT/local, editor UI) | **MCP** (`rmcp`, stdio or TCP) + HTTP REST mirror :8080 | Tools CRUD documents via storage-service API |
| Third-party MCP tool servers | MCP over child-process stdio | Loaded from `MCP_PLUGIN_CONFIG` JSON |
| OpenCloud (OCIS) | **WOPI** (docserver), WebDAV | `WOPI_HOST_URL=http://ocis:9200` |
| External AI vendors | HTTP (chat completion) | Passthrough proxy; no SSE engine |
| Ops / observability | `/metrics` (Prometheus), `/health`, `RUST_LOG` | Grafana/Loki/Tempo |

### Internal service contracts (gateway upstream map)

| Service | Base port | Contract |
|---------|-----------|----------|
| identity-service | 8001 | JWT issue/verify, OAuth2 |
| storage-service | 8002 | `POST/GET /files`, `GET /files/{id}`, `/content`, `DELETE` |
| conversion-service | 8003 | Format conversion (calls `wo-x2t`) |
| coauthoring-service | 8004 | Sessions REST + WS CRDT |
| session-service | 8005 | Session lifecycle |
| api-gateway | 8080 | Single entry, CORS, health |
| mcp-server | 8080 (own) | MCP + REST mirror |
| wo-docserver | 80 | WOPI to OCIS |

## 3.3 Scope

### In scope (cloud + AI)

Gateway, identity/session, storage, conversion, coauthoring, MCP server,
Node docserver AI proxy, admin panel AI configuration, WOPI docserver,
observability, CI/E2E of the cloud.

### Out of scope for this doc set

16 format-parser crates internals (except `wo-x2t` as the conversion
back-end), Tauri desktop, TypeScript editors' UI architecture — referenced
only as upstream/downstream consumers. The **canonical** Python product is
documented separately (`server-py/docs/arc42/`).
