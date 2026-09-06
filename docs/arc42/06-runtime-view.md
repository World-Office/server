# 06 — Runtime View

> arc42 §6 · Key runtime scenarios of the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 6.1 R-1 — Request path through the gateway (auth + storage)

```
Browser → POST /files  (Authorization: Bearer JWT)
   api-gateway (:8080)
     ├─ verify JWT (JWT_SECRET, shared with identity-service)
     ├─ CORS preflight handled (tower-http)
     └─ route → storage-service (:8002)
            POST /files → SQLite metadata insert + blob write
            → 201 {id, name, ...}
GET /files/{id}/content → blob stream
DELETE /files/{id}     → row + blob removed
```

Every path is a straight gateway hop; services never expose public ports
beyond the gateway (except the docserver 80 and mcp-server's own port for
agent clients).

## 6.2 R-2 — Identity & session lifecycle

```
Browser → POST /auth/login        → identity-service (:8001) → JWT
       → POST /session            → session-service (:8005) → session record
       → subsequent calls carry JWT; gateway validates, session-service
         tracks lifecycle (create/refresh/end)
```

## 6.3 R-3 — Conversion pipeline

```
Client → POST /convert {src_format, dst_format, file_id}
   gateway → conversion-service (:8003)
      fetch content from storage-service
      invoke wo-x2t (crate) conversion
      store/return result
```

## 6.4 R-4 — Real-time collaboration (coauthoring)

```
Editors A, B
   A → POST /sessions {document_id}   → 201 {session_id, ws_url}
   A → WS /ws/{session_id}            (setup/join)
   B → POST /sessions/{id}/join {user_id, username} → 200 {participants, color}
   B → WS /ws/{session_id}
   A · B exchange CRDT ops (diamond-types ListCRDT) over WS
        - every op → model_op; late joiners get replay
        - session metadata persisted to SQLite; broadcast channels ephemeral
        - presence (cursors) + annotation comments in-band
   GET /sessions → active sessions; GET /sessions/{id} → participants
```

## 6.5 R-5 — MCP agent calling a document tool

```
AI agent (MCP client)            mcp-server (rmcp)
   ├── initialize ──────────────►│  protocolVersion/capabilities
   ├── tools/list ──────────────►│  14 built-in tools (+ plugin tools, plugin=true)
   ├── call list_documents ─────►│  tools.rs → client.rs → storage-service GET /files
   │                             │  → result ContentItem[{type:"text", text:"..."}]
   ├── call write_document ──────►│  → storage write + snapshots.rs version snapshot
   ├── call unknown_tool ────────►│  → is_error:true
   │
   Browser (no MCP client)       REST mirror (:8080)
   ├── GET  /api/tools           → all tools
   ├── POST /api/tools/{name}/call → typed ContentItem; 400 unknown tool
   │
   Plugin call fallthrough: built-ins checked first → each plugin child
   process (spawned from MCP_PLUGIN_CONFIG) in order → first match wins
```

## 6.6 R-6 — Admin AI chat (passthrough proxy)

```
AdminPanel AiChat (/ai/chat)
   ├─ GET  /admin/api/v1/ai/providers  → provider list (keys masked ••••)
   ├─ PUT  /admin/api/v1/ai/providers  → replace provider set in config
   │       (aiSettings.providers/customProviders/actions/models)
   └─ POST /docservice/ai              → Node docservice
        forward {url, method, body, headers} to the configured provider
        → full response returned at once (POST/response; NO SSE streaming)
   Settings page: timeout, CORS, proxy URL
```

## 6.7 R-7 — WOPI docserver bridge to OpenCloud

```
OCIS → GET /hosting/discovery (wo-docserver)
OCIS → GET /wopi/files/{id}?access_token=JWT   → CheckFileInfo (wo-wopi handlers)
    → GET /wopi/files/{id}/contents            → GetFile (from storage or OCIS)
    → POST /wopi/files/{id}/contents + lock    → PutFile
wo-docserver validates JWT (JWT_SECRET), delegates content to WOPI_HOST_URL
(OCIS :9200) when configured.
```

## 6.8 R-8 — Observability path

Every service exposes `/metrics` (Prometheus scrape) + `/health` (compose
healthcheck). Logs → stdout (RUST_LOG) → Loki; traces → Tempo; dashboards →
Grafana (`production overview`, `services`, `conversion`, `logs`).
