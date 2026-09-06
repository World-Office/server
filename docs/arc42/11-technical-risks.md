# 11 — Technical Risks

> arc42 §11 · Risks of the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference · P/I = probability/impact (L/M/H)

## 11.1 Risk register

| # | Risk | P | I | Description | Mitigation / status |
|---|------|---|---|-------------|---------------------|
| R-R-1 | **Deprecated stack bit-rot** | H | M | No new work → deps go stale, protocol drift (WOPI/MCP), crates break on toolchain bumps. | This documentation is the record; rollback/migration only; canonical product lives in `server-py`. |
| R-R-2 | **Incomplete cloud surface** | H | M | Only storage-service is "fully implemented"; gateway/identity/etc. are 1-file shells (services/AGENTS.md admits it). | Treat as reference; Python rewrite covers the needed subset (WOPI host/client, CRDT hub) in one process. |
| R-R-3 | **AI provider key handling** | M | H | Keys masked in responses but **stored as-is** in runtime config (ai-integration spec §1.2); a config leak = key leak. | AES-GCM-at-rest was the original intent, never implemented; new work should fix or (better) use the Python stack. |
| R-R-4 | **AI chat: no streaming, no attribution** | M | M | POST/response proxy gives no token-streaming UX and no per-op audit trail for agent edits. | Acceptable at the time; agents/safety moved to the CRDT control plane in the Python rewrite (Python ADR-007). |
| R-R-5 | **diamond-types CRDT dependency health** | M | M | Convergence delegated to an external library; upgrades/forks risk behavior drift. | Pinned versions; coauthoring is reference-only now. |
| R-R-6 | **Nightly toolchain (stable ICE)** | M | M | Nightly-only builds for wo-pdf/wo-webdav; release builds can diverge from CI. | Documented workaround (ADR-R7); contributing reason for the rewrite. |
| R-R-7 | **Service sprawl** | M | L | 8 microservices + Node + admin = ops/complexity burden; observability itself adds 4 components. | Gateway-first design contained it; still heavy — the rewrite's core objection. |
| R-R-8 | **Node.js polyglot surface** | M | M | 189-file Node service has its own lint/CI/npm debt inside a Rust codebase. | Own AGENTS.md + CI; acknowledged exception (ADR-R6). |
| R-R-9 | **MCP REST mirror port collision** | L | L | mcp-server defaults to :8080, same as gateway's mapped port. | Distinct compose networks/host binding required; documented in spec. |
| R-R-10 | **E2E flakiness in containerized Playwright/Jest** | M | L | Full-stack E2E depends on compose health + timing. | Healthcheck-based `depends_on`, start periods, CI caching; auto-cancel stale runs. |

## 11.2 Accepted/obsolete risks

- R-R-3, R-R-4, R-R-7, R-R-8 are effectively **obsoleted by the deprecation** —
  the canonical stack solves or avoids them by construction (one process,
  no vendor keys server-side, no npm, no microservices).
- R-R-5/R-R-6 are reference-only history.
