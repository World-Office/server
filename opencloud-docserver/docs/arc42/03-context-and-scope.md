# 03 — Context & Scope

## System context diagram

```
            ┌────────────────────── Caddy (TLS, cloud.graphwiz.ai) ─────────────────────┐
            │                                                                           │
 ┌──────────┴─────────┐   WOPI (discovery, CheckFileInfo, PutFile)   ┌───────────────────┴─────────┐
 │   OpenCloud        │ ───────────────────────────────────────────▶ │        docserver            │
 │   (file cloud)     │ ◀────────────  /app iframe  ──────────────── │   (this system, FastAPI)    │
 └────────────────────┘                                              └───────┬──────────┬──────────┘
        ▲  ▲                                                                 │          │
        │  │ /app/open (web UI)                        browser editor UI ◀────┘          │ export
        │  └────────────── users ──────────▶  ┌──────────────────┐                     ▼
        │                                     │  editor.js        │              WeasyPrint → PDF
        │                                     └──────────────────┘              (fonts: dejavu)
        │
        │  MCP stdio (JSON-RPC)                ┌──────────────────┐
        └───────────────────────────────────── │  agent (any MCP   │
                                               │  client/LLM)      │──▶ model provider
                                               └──────────────────┘    (caller-side transport)

 Optional neighbor: OnlyOffice Document Server — used ONLY by the conformance oracle
 (wo-conformance) to score fidelity against LibreOffice truth. Not a product dependency.
```

## Neighbors

| Neighbor | Interface | Role |
|----------|-----------|------|
| OpenCloud / Nextcloud | WOPI (XML discovery + HTTP) | files, auth, storage; registers the docserver as editor app |
| Caddy | reverse proxy | TLS, `cloud.graphwiz.ai` → OpenCloud, editor host → docserver |
| Browsers | HTTP + SSE + CRDT ops | the editor UI (`web/editor.js`) |
| Agent frameworks | MCP stdio (JSON-RPC 2.0, newline-delimited) | tool catalog + tool calls |
| LibreOffice / OnlyOffice | subprocess / container (oracle only) | truth render + comparative fidelity scoring |

## In scope / out of scope

**In:** WOPI docserver, editor UI+backend, CRDT collaboration, DOCX/ODT conversion, PDF/ODT/DOCX/HTML
export, agent tool surface + runner + adapters, version snapshots, lock plane, review stream.

**Out:** file storage itself (cloud owns it), authn of end users (cloud owns it), multi-node
collab scale-out, desktop/mobile shells, format breadth beyond DOCX/ODT (+ their PDF projections),
model hosting.
