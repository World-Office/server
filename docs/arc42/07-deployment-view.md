# 07 — Deployment View

> arc42 §7 · Deployment topology, environments, observability of the Rust cloud.
> **Revision:** 2026-09-05 · Status: reference

## 7.1 Topology (docker-compose, `server/docker-compose*.yml`)

```
   Host (Docker Engine)
   ├─ docker-compose.services.yml   (cloud services)
   │   ├─ identity-service  :8001  (internal)
   │   ├─ storage-service   :8002  (internal)
   │   ├─ conversion-service:8003  (internal)
   │   ├─ coauthoring-service:8004 (internal)
   │   ├─ session-service   :8005  (internal)
   │   ├─ api-gateway       :8080  (public, GATEWAY_PORT env)
   │   └─ docserver         :80    (public, DOCSERVER_PORT env; WOPI)
   ├─ services/server (Node docservice; OnlyOffice-derived AdminPanel)
   ├─ mcp-server (rmcp + REST :8080)
   ├─ admin-panel (TypeScript build, served via Node docservice)
   ├─ observability profile:
   │   ├─ Prometheus :9090   (scrapes /metrics on all services)
   │   ├─ Grafana    :3002   (prebuilt dashboards)
   │   ├─ Loki       :3100   (logs)
   │   └─ Tempo             (traces)
   └─ E2E stack: tests/ (Jest + Playwright) + Docker Compose
```

Service links (gateway env): identity 8001, storage 8002, conversion 8003,
coauthoring 8004, session 8005. Docserver env: `WOPI_HOST_URL` (default
`http://ocis:9200`), `JWT_SECRET`.

## 7.2 Packaging & build

- `services.Dockerfile` builds any Rust service via `SERVICE_NAME` ARG
  (matrix in CI); `core/crates/wo-docserver/Dockerfile` builds the WOPI
  docserver.
- Frontend: `pnpm build` (Turbo; excludes `@world-office/tauri-poc` because
  AppImage bundling needs `linuxdeploy`); `frontend-dist/` packaging.
- Rust toolchain: nightly in CI (stable ICE on wo-pdf/wo-webdav);
  `cargo clippy --workspace`, `cargo fmt`.

## 7.3 Configuration

| Variable | Default | Used by |
|----------|---------|---------|
| `JWT_SECRET` | dev value | gateway + services (shared!) |
| `GATEWAY_PORT` / `DOCSERVER_PORT` | 8080 / 80 | host mapping |
| `WOPI_HOST_URL` | `http://ocis:9200` | docserver |
| `RUST_LOG` | `info` | all Rust services |
| `MCP_PLUGIN_CONFIG` | — | mcp-server plugin JSON |

## 7.4 Environments

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local dev** | `docker compose up` with overrides | `docker-compose.dev.yml`, `docker-compose.override.yml` |
| **CI** | gate | workflows: ci, deploy, docker, release, security, wasm; E2E starts the Docker stack, runs Playwright + Jest |
| **Prod compose** | reference prod | `docker-compose.prod.yml`; observability profile |

## 7.5 Observability

- Prometheus scrapes `/metrics` across all 8 services.
- Grafana dashboards: production overview, services, conversion, logs.
- Loki centralizes logs; Tempo distributed tracing.
- Healthchecks: `curl -f http://localhost:<port>/health` with
  intervals/start periods per service.

## 7.6 Backup & data

- storage-service: SQLite metadata + blob dir (volume); backups = SQLite
  dump + blob copy.
- coauthoring-service: SQLite session metadata (ephemeral state, safe to lose).
- Critical config not on volumes: `JWT_SECRET`, provider keys in runtime
  config (managed via admin API).

## 7.7 Status note

Deployment of this stack is **not** the current production target — the
Python docserver (`server-py/`) plus OCIS is. This page documents the old
compose topology for the record and for any migration/rollback planning.
