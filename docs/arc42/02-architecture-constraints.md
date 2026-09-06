# 02 — Architecture Constraints

> arc42 §2 · Constraints that bounded the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 2.1 Organizational / licensing

| # | Constraint | Compliance |
|---|-----------|------------|
| C-R-ORG-1 | **AGPL-3.0-or-later**; enterprise extensions in separate private repos | `services-enterprise/`, `core-enterprise/`, `LICENSE-COMMERCIAL` |
| C-R-ORG-2 | The stack is **deprecated (reference only)** since 2026-08-19 | This documentation is the record; no new work expected here |

## 2.2 Technology constraints

| # | Constraint | Source | Compliance |
|---|-----------|--------|------------|
| C-R-TEC-1 | **Rust edition 2024**; nightly in CI, stable for releases | `rust-toolchain.toml` | Nightly needed: stable 1.94.1 hits ICE on `wo-pdf`/`wo-webdav` |
| C-R-TEC-2 | **All Rust services use `axum` + `tokio` + `tracing`** | services/AGENTS.md | Uniform across 8 services |
| C-R-TEC-3 | **Shared workspace dependencies** from root `Cargo.toml` | services convention | Single lockfile story |
| C-R-TEC-4 | Frontend = pnpm monorepo, **Biome** lint, Turbo orchestration | server root | `pnpm dev/test/lint/typecheck` |
| C-R-TEC-5 | **`services/server` is Node.js** — exception to the Rust rule | OnlyOffice-derived docservice surface | Own AGENTS.md, ESLint 9 + Prettier, own CI |
| C-R-TEC-6 | Standard protocols: **WOPI** (editing), **WebDAV** (file access), **MCP** (AI tools) | wo-wopi/wo-webdav/mcp-server | Protocol crates implemented from specs, not bespoke APIs |
| C-R-TEC-7 | SQLite for service metadata; **no DB server** | storage/coauthoring/session services | SQLite + disk blobs |
| C-R-TEC-8 | Docker Compose as the deployment topology; `services.Dockerfile` matrix build | `docker-compose.services.yml`, CI | One service per container |

## 2.3 Product/scope constraints (cloud+AI focus)

| # | Constraint | Compliance |
|---|-----------|------------|
| C-R-PRO-1 | All REST/WS surfaces reachable through the **api-gateway** (port 8080) | Upstream map in gateway env (8001…8005) |
| C-R-PRO-2 | Coauthoring uses **CRDT** (diamond-types `ListCRDT`) not OT | `plan/specs/collaboration/spec.md`; broadcast channels ephemeral, metadata in SQLite |
| C-R-PRO-3 | MCP server exposes **14 built-in tools** + plugin tool servers (child processes via `MCP_PLUGIN_CONFIG`) | `services/mcp-server` spec; `tools.rs` |
| C-R-PRO-4 | AI chat = **POST/response passthrough proxy**, not SSE streaming engine | `plan/specs/ai-integration.md` §1.1 (actual impl, 2026-06-26) |
| C-R-PRO-5 | AI provider/API keys managed in config (`aiSettings.providers/.customProviders/.actions/.models`), masked in API responses | Admin node service |

## 2.4 Operational constraints

| # | Constraint | Compliance |
|---|-----------|------------|
| C-R-OPS-1 | Every service exposes `/health`; metrics at `/metrics` (Prometheus) | Compose healthchecks `curl -f`; observability stack |
| C-R-OPS-2 | Environment-driven config: `JWT_SECRET` shared across gateway/services; `RUST_LOG` | Compose env blocks |
| C-R-OPS-3 | Traces via **Tempo**, logs via **Loki**, dashboards via **Grafana** | `observability/` |
| C-R-OPS-4 | CI runs `cargo build/test/clippy/fmt`, `pnpm` tasks, and E2E (Jest+Playwright+Docker) | `.github/workflows/` |

## 2.5 Anti-pattern constraints (from services/AGENTS.md)

- **NEVER** expose WOPI endpoints without auth tokens.
- **NEVER** add npm deps to `server/` without updating `package-lock.json`.
- **NEVER** commit to `server/` without `npm run code:check`.
