# 10 — Quality Requirements

> arc42 §10 · Quality tree and scenarios for the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 10.1 Quality tree

```
Quality model (as designed for the Rust cloud & AI platform)

Cloud platform
 ├─ Availability       → healthchecks on every service, restart policies
 ├─ Correctness        → unit tests (storage 7 repo tests), E2E over Docker
 ├─ Security           → JWT everywhere, CORS, WOPI auth always
 ├─ Observability      → /metrics + /health + tracing + Loki logs
 └─ Maintainability    → uniform axum/tokio/tracing stack, shared workspace

Real-time collaboration
 ├─ Convergence        → diamond-types CRDT (library-proven)
 ├─ Latency            → WS binary/LOP ops, ephemeral channels
 └─ State             → SQLite session persistence

AI integration
 ├─ Openness           → MCP (rmcp) + REST mirror; no vendor SDK
 ├─ Plugin safety      → child-process isolation for third-party servers
 ├─ Data integrity     → write_document snapshots version images
 └─ Configurability    → providers/models/actions via config API
```

## 10.2 Quality table

| # | Quality | Requirement | Verifiable by |
|---|---------|-------------|---------------|
| QR1 | Availability | every service healthy before gateway starts (`depends_on: service_healthy`) | compose healthchecks |
| QR2 | Correctness | storage CRUD round-trips metadata + blobs | 7 repo unit tests |
| QR3 | Security | `JWT_SECRET` enforced at gateway; WOPI endpoints never unauthenticated | review + E2E |
| QR4 | Collaboration | concurrent editors converge (diamond-types); late join replay works | `plan/specs/collaboration` scenarios, E2E coediting |
| QR5 | AI tool surface | 14 tools listed; unknown tool → `is_error`; plugin tools aggregated | `plan/specs/mcp-server` R1–R3 scenarios |
| QR6 | AI integrity | write_document snapshots prior version | snapshots.rs + spec R1 |
| QR7 | Config | providers editable via PUT; keys masked | admin API scenarios (ai-integration spec) |
| QR8 | Observability | Prometheus scrapes all services; dashboards load | observability profile, Grafana |
| QR9 | Portability | frontend builds with `pnpm build`; services build via `services.Dockerfile` matrix | CI |

## 10.3 Quality scenarios

**S1 — "Agent edits an important document" (AI integrity).** An agent calls
`write_document` on a shared document. *QoS:* a version snapshot of the
previous content exists; the restore path (storage /versions) can recover it;
the call never blocks on plugin timeouts. **Proof:** snapshots logic +
spec-scenario tests.

**S2 — "Two users type simultaneously" (convergence).** Editors A and B (and
a late-joining C) edit the same paragraph over WebSocket. *QoS:* all three
converge to the same text; participant colors/presence update. **Proof:**
diamond-types + replay + coauthoring E2E.

**S3 — "Gateway is the single door" (security).** A client tries `/files`
directly (not through gateway) or with a bad JWT. *QoS:* rejected; WOPI
endpoints always carry a valid token. **Proof:** gateway routing + E2E.

**S4 — "Admin configures a new AI provider" (configurability).** An admin
opens AiProviders, edits a provider URL/key, saves. *QoS:* PUT replaces the
set; the read-back response masks the key; a subsequent `/docservice/ai`
call reaches the new URL. **Proof:** admin AI API scenarios.

## 10.4 Governance (as implemented)

- CI gates: cargo build/test/clippy/fmt, pnpm lint/typecheck, Jest +
  Playwright E2E; WASM crates via `wasm.yml`; doc-only changes skip CI.
- No-WOPI-without-auth, no-npm-dep-without-`package-lock.json` update, and
  mandatory `npm run code:check` are hard anti-pattern rules (services/AGENTS.md).
- (The Python rewrite later added a mutation-score merge gate — see Python
  set §10 — not present in this stack.)
