# World-Office — Python Cloud & AI Platform — arc42 Documentation

> **System:** opencloud-docserver (`server/opencloud-docserver/`) — the single FastAPI service that
> *is* World-Office: WOPI docserver, real-time editor backend, document conversion, and the agent
> (AI) surface.
> **Format:** [arc42](https://arc42.org) — one document per section, plus this index. **Focus: cloud + AI.**

This is the **canonical** architecture record. The parallel set at `server/docs/arc42/` documents the
deprecated Rust + TypeScript cathedral and is kept only as a reference of what was.

## Lineage & direction

World-Office began as a Rust workspace (26 crates, 8 microservices, TypeScript monorepo).
The 2026-08 rethink (`plan/RETHINK_WORLD_OFFICE.md`) cut the product to one question: *what does a
user of an OpenCloud/Nextcloud file cloud actually need from a document editor?* The answer is one
stateless-ish Python service speaking WOPI, with collaboration, conversion, export, and — since the
agentic-AI change — a model-agnostic agent surface. Everything else (format-parser breadth, custom
renderers, desktop shells) was descoped or moved behind the conformance harness as *verification
infrastructure*, not product.

## Document map

| # | Section | TL;DR |
|---|---------|-------|
| 01 | [Introduction & Goals](01-introduction-and-goals.md) | One service, four jobs; cloud+AI goals. |
| 02 | [Architecture Constraints](02-architecture-constraints.md) | Python 3.12/uv, stdlib-first, WOPI standard, no vendor SDKs. |
| 03 | [Context & Scope](03-context-and-scope.md) | OpenCloud/Caddy/OnlyOffice neighbors; what is in and out. |
| 04 | [Solution Strategy](04-solution-strategy.md) | Stoic checks: loud failure, honest register, agents-as-clients. |
| 05 | [Building Block View](05-building-block-view.md) | editor/ · wopi/ · ai/ · lib/store.py — whitebox. |
| 06 | [Runtime View](06-runtime-view.md) | Open-in-editor, collaborative edit, agent loop, export. |
| 07 | [Deployment View](07-deployment-view.md) | docker compose, Caddy TLS, live stack, staging. |
| 08 | [Cross-cutting Concepts](08-cross-cutting-concepts.md) | CRDT op pipeline, lock parity, typed errors, determinism. |
| 09 | [Architecture Decisions](09-architectural-decisions.md) | ADR log: SQLite, TextCRDT, MCP-stdio, WeasyPrint, no SDK. |
| 10 | [Quality Requirements](10-quality-requirements.md) | 1,476-test suite, register 82/82, conformance oracle. |
| 11 | [Technical Risks](11-technical-risks.md) | Hub memory, single-node, exporter limits, model egress. |
| 12 | [Glossary](12-glossary.md) | WOPI, CRDT, register, grounding pack, divergence… |
