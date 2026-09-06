# 04 — Solution Strategy

> arc42 §4 · Fundamental shaping decisions of the Rust cloud & AI platform.
> **Revision:** 2026-09-05 · Status: reference

## 4.1 P1 — Gateway-centric microservices, one language

**Chosen:** every backend concern is a dedicated `axum`+`tokio` Rust service
behind an `api-gateway` (auth, routing, CORS), orchestrated by Docker
Compose. **Why:** bounded deployable units, uniform tooling, RIIR flavor of
the day; tracing across services for free. **Later status:** the whole
cloud was judged too heavy; the Python rewrite collapses it to one process
(ADR-001/010 in the Python set) — this remains the record of the *prior*
choice.

## 4.2 P2 — Format crates as libraries, services as thin shells

**Chosen:** 26 core crates (16 format parsers + renderer + WASM + protocols)
are libraries; services are thin HTTP shells over them (e.g.
`conversion-service` → `wo-x2t`; `wo-docserver` → `wo-wopi` handlers).
**Why:** reuse across web, desktop and services; single source of format
truth. **Focus note:** the cloud/AI docs reference only the shells and the
protocol crates.

## 4.3 P3 — CRDT collaboration via diamond-types

**Chosen:** `coauthoring-service` uses `diamond-types` `ListCRDT` for
conflict-free concurrent text ops over WebSockets; sessions persisted to
SQLite, broadcast channels ephemeral; presence + annotations on the side.
**Why:** convergence without an OT server; battle-tested library instead of
hand-rolled CRDT. Contrast with the Python rewrite, which hand-rolls a
small RGA (that set's ADR-006).

## 4.4 P4 — MCP as the AI-open-protocol

**Chosen:** Rust `mcp-server` implements the `rmcp` server trait exposing
**14 built-in tools** (document CRUD, version snapshots, comments, mentions,
cross-document links) that operate on the storage-service API — plus a
**plugin system** that spawns third-party MCP tool servers as isolated child
processes — plus a **REST mirror** (`/api/tools`, `/api/tools/:name/call`)
so browser clients need no MCP client library.
**Why:** agents and humans share one API; open protocol; isolation for
untrusted tool plugins.

## 4.5 P5 — AI chat as a config-managed passthrough proxy

**Chosen:** the admin AI is deliberately simple: the Node docservice exposes
`POST /docservice/ai` as a **passthrough proxy** to a configured provider
URL (method/body/headers forwarded), and `GET/PUT /admin/api/v1/ai/providers`
manages the provider list. Provider config lives in runtime config
(`aiSettings.providers`, `.customProviders`, `.actions`, `.models`);
key values are **masked** (`"••••••"`) in responses.
**Why:** the original spec's 13-class provider engine + SSE streaming was
rejected as over-engineered; the actual implementation (2026-06-26) is
deliberately small. **Later status:** superseded by the Python stack's
model-agnostic `AgentRunner` + MCP-stdio (see Python set ADR-007).

## 4.6 P6 — Observability by default

**Chosen:** Prometheus (`/metrics` on every service) + Grafana dashboards +
Loki logs + Tempo traces, all compose-able behind a profile.
**Why:** 8 services need central visibility.

## 4.7 Strategy-to-requirement map

| Requirement | Pillar |
|-------------|--------|
| Many cloud services, bounded | P1 |
| Format reuse everywhere | P2 |
| Real-time collab | P3 |
| AI agents on documents | P4 |
| Admin chat AI, simple | P5 |
| Operational insight | P6 |
