# SERVICES

**Generated:** 2026-04-19 | **License:** AGPL-3.0 | **Rust edition:** 2024

## OVERVIEW

8 Rust microservices + 1 Node.js document server. All Rust services use axum + tokio.

## STRUCTURE

```
services/
├── api-gateway/          # Request routing (1 rs file)
├── identity-service/     # Auth: JWT, OAuth2 (1 rs file)
├── session-service/      # Session management (1 rs file)
├── storage-service/      # File storage: SQLite metadata + disk blobs (4 rs files)
├── conversion-service/   # Format conversion (3 rs files)
├── coauthoring-service/  # Real-time collaboration (1 rs file)
├── server/               # Node.js document builder server (189 JS files)
│   ├── DocBuilder/       # CLI document conversion tool
│   ├── Common/           # Shared server modules
│   └── AGENTS.md         # Has own knowledge base
└── admin-panel/          # Admin dashboard (TypeScript, 10 files)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `api-gateway/` | Request routing |
| Auth logic | `identity-service/` | JWT + OAuth2 |
| File CRUD | `storage-service/` | SQLite metadata, disk blobs |
| Conversion | `conversion-service/` | Calls wo-x2t |
| Co-editing | `coauthoring-service/` | Real-time collaboration |
| DocBuilder CLI | `server/DocBuilder/` | Node.js, see server/AGENTS.md |
| Admin UI | `admin-panel/` | TypeScript frontend |

## STORAGE SERVICE DETAILS

Only fully implemented service with real CRUD:
- SQLite-backed metadata (files table: id, name, content_type, size, path, timestamps)
- Disk-based blob storage
- REST: POST /files, GET /files, GET /files/{id}, GET /files/{id}/content, DELETE /files/{id}
- 7 repository unit tests (insert, get, list, delete, persistence)

## CONVENTIONS

- All Rust services: `axum` + `tokio` + `tracing` for logging
- Shared workspace deps from root `Cargo.toml`
- `services/server/` is Node.js — has own AGENTS.md, own linting (ESLint 9 + Prettier)
- Docker builds use `services.Dockerfile` (matrix in CI)

## ANTI-PATTERNS

- NEVER expose WOPI endpoints without auth tokens
- NEVER add npm deps to `server/` without updating `package-lock.json`
- NEVER commit to `server/` without `npm run code:check` (lint + format)

## NOTES

- All 8 Rust services have real implementations — thin binaries wrapping library crates with axum + tokio. The `services/AGENTS.md` structure table lists their current capabilities.
- `services-enterprise/` has 3 additional services (audit, SCIM, webhooks) under commercial license
- CI Docker build matrix covers: identity-service, storage-service, conversion-service, coauthoring-service, session-service, api-gateway, wo-docserver
