# 05 — Building Block View

> arc42 §5 · Whitebox decomposition — Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference · Paths relative to `server/`.

## 5.1 Level 1 — services

```
                  ┌───────────────────────────────┐
                  │         api-gateway           │  axum, routing,
                  │         (:8080)               │  JWT, CORS
                  └──┬─────┬──────┬──────┬────────┘
      ┌──────────────┘     │      │      └────────────┐
┌─────▼─────┐ ┌─────▼────┐ ┌▼─────┐ ┌─▼────────┐ ┌───▼────────┐
│ identity  │ │  session │ │storage│ │conversion│ │ coauthoring│
│ (:8001)   │ │ (:8005)  │ │(:8002)│ │ (:8003)  │ │ (:8004)    │
│ JWT/OAuth2│ │ sessions │ │SQLite │ │ wo-x2t   │ │ WS CRDT    │
└───────────┘ └──────────┘ │+blobs │ └──────────┘ └────────────┘
                           └───────┘
      ┌───────────────────┐   ┌──────────────────┐  ┌──────────────────┐
      │  wo-docserver     │   │ services/server  │  │   mcp-server     │
      │  (WOPI, :80)      │   │ (Node 189 js)    │  │  (rmcp + REST)   │
      │  wo-wopi → OCIS   │   │ DocBuilder CLI,  │  │  14 tools        │
      │                   │   │ AdminPanel,      │  │  + plugins       │
      │                   │   │ /docservice/ai   │  │  (child proc)    │
      └───────────────────┘   └──────────────────┘  └──────────────────┘
```

## 5.2 Level 2 — service internals

### 5.2.1 `services/api-gateway/` (1 rs file)
Single entry point: route dispatch to upstreams (8001–8005), `JWT_SECRET`
verification, CORS via `tower-http`, `/health`. Routes incl. `/auth/*`,
`/files`, `/convert`, `/collab`, `/mcp`, `/session/*`.

### 5.2.2 `services/identity-service/` (1 rs file)
JWT issuance/verification, OAuth2 flows; issues the tokens the gateway trusts.

### 5.2.3 `services/session-service/` (1 rs file)
Session lifecycle management (REST).

### 5.2.4 `services/storage-service/` (4 rs files) — the fully implemented benchmark
- SQLite-backed metadata: `files` (id, name, content_type, size, path, timestamps)
- Disk-based blob storage
- REST: `POST /files`, `GET /files`, `GET /files/{id}`, `GET /files/{id}/content`, `DELETE /files/{id}`
- 7 repository unit tests (insert, get, list, delete, persistence)
- This is the API the MCP server's document tools call.

### 5.2.5 `services/conversion-service/` (3 rs files)
Converts between formats by shelling into `wo-x2t`; exposed via `/convert`.

### 5.2.6 `services/coauthoring-service/` (1 rs file; src: cursor, document, integration, model_op, replay, main)
- REST: `POST /sessions`, `POST /sessions/{id}/join`, `GET /sessions/{id}`, `GET /sessions`
- WS: `GET /ws/{session_id}` — diamond-types `ListCRDT` op stream (model_op),
  replay for late joiners, cursor/presence, annotation comments
- SQLite persistence of session metadata; broadcast channels ephemeral
- Presentation-level shape operations (slides) alongside text ops

### 5.2.7 `services/mcp-server/` (main.rs, tools.rs, client.rs, snapshots.rs)
- `main.rs`: rmcp server loop; tools catalog
- `tools.rs` (`McpTools`): 14 `Tool::new(...)` defs — `list_documents`,
  `get_document_info`, `read_document`, `create_document`,
  `write_document`, … version-snapshot tools, comment tools, mention and
  cross-document-link tools; all call the storage-service HTTP API
- `client.rs`: HTTP client to storage-service / plugin servers
- `snapshots.rs`: version snapshot handling for `write_document`
- Plugin loader: spawns external MCP tool servers from `MCP_PLUGIN_CONFIG`,
  MCP handshake, tool aggregation with `plugin: true`, first-match
  dispatch fallthrough
- REST mirror (default :8080): `GET /api/tools` → all tools;
  `POST /api/tools/:name/call` → typed `ContentItem` results; 400 on
  unknown tool, `is_error: true` on tool failure

### 5.2.8 `services/server/` (Node.js, 189 files) — OnlyOffice-derived
- `DocBuilder/`: CLI document conversion tool
- `Common/`: shared modules
- `AdminPanel/`: serves the TS admin app
- `routes/ai/router.js`: `GET/PUT /admin/api/v1/ai/providers`;
  `POST /docservice/ai` → passthrough proxy to configured provider
- Config: `runtimeConfigManager` + config package with
  `aiSettings.providers/.customProviders/.actions/.models`;

### 5.2.9 `admin-panel/` (TypeScript)
Pages `AiChat.tsx` (`/ai/chat`, POST proxy chat, no SSE), `AiProviders.tsx`
(provider list/edit, masked keys), `AiSettings.tsx` (timeout, CORS, proxy URL).

### 5.2.10 `core/crates/wo-docserver` + `wo-wopi` (WOPI docserver)
- `wo-wopi/src/`: `handlers.rs`, `models.rs`, `server.rs`, `storage.rs`
  — WOPI server implementation
- `wo-docserver`: HTTP service (:80) wiring wo-wopi handlers to
  `WOPI_HOST_URL` (OCIS :9200), `JWT_SECRET` for token validation

### 5.2.11 Supporting crates referenced by cloud
`wo-x2t` (conversion), `wo-webdav` (WebDAV), `wo-route` (Visio connector
routing — AI-relevant only via diagram tools), `wo-common` (shared types).

## 5.3 Ownership rules
- All Rust services: axum + tokio + tracing; `RUST_LOG` controls verbosity.
- No service stores what another owns (single-writer per aggregate).
- AI tools are thin adapters over **public service APIs** — never direct
  DB access from the MCP server.
