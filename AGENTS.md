# World-Office WORKSPACE

> 🧨 **REACT REMOVED 2026-11-27.** The repo no longer contains React code: the five `apps/web/apps/*-react` apps, `editor-shell`, `collaboration-react`, `services/admin-panel`, the Tauri PoC, the ONLYOFFICE mobile React app (`apps/web/apps/common/mobile`) and the tracked `frontend-dist/` bundle are deleted. **There is no buildable editor UI in this tree** — prod and staging keep serving the last staged bundle from the `editor-ui` host mounts, and the next UI is the Leptos/WASM port (ADR-F1; PoC in `apps/web/apps/ribbon-leptos/`). Source for everything removed: git history at `1e3c65bb`. Untouched: Rust core, `wo-renderer-wasm`, `wo-x2t-wasm`, the docserver, and the framework-agnostic `packages/*`.
>
> ⚠️ **CANONICAL 2026-11-16 (updated: React canvas editor is /word).** The Rust docserver container (`docserver-1`, port `:8082`) is the production editor backend behind `editor.cloud.graphwiz.ai` (traefik route committed as `d363467` in `/opt/git/docker-traefik`). **The python-lineage WYSIWYG word editor was RETIRED from deployment 2026-11-16** and its directory moved off main to branch **`legacy/wysiwyg-python-editor`** (source + `wo-bridge.js` + 159-test gate suite; last main-tree state preserved there). `/word/` now serves the React canvas editor (`apps/web/apps/documenteditor-react`, wasm renderer + typed ops). The Python rewrite at `server/opencloud-docserver/` was REMOVED 2026-10-14 (history at `cf98bf78e`, repo mirror at github.com/World-Office/server-py). The staging OpenCloud stack also runs the Rust docserver (container `docserver`, `:8086`).

**Updated:** 2026-07-21
**Source:** codeberg.org/World-Office/server (independent project)
**License:** AGPL-3.0-or-later (enterprise extensions in separate private repo)
**Crate count:** 26 core + 8 services
**Rust edition:** 2024 (nightly in CI, stable for releases)

## OVERVIEW

World-Office is an independent, open-source document editing suite built in Rust + TypeScript. The Rust core implements format parsing, rendering, conversion, WOPI/WebDAV protocols, and WASM/browser targets. The TypeScript monorepo (pnpm) holds framework-agnostic editor packages (controllers, ribbon specs, plugin SDK, stores, i18n); the React editor apps were removed 2026-11-27 and the editor UI is being ported to Leptos/WASM (ADR-F1).

## STRUCTURE

```
server/
+-- core/crates/                     26 Rust crates (format parsers, renderer, WASM, protocols)
+-- services/                        8 Rust microservices
+-- apps/web/                        Web editor frontend (Leptos ribbon PoC, themes, translations)
+-- apps/web/apps/                   ribbon-leptos (WASM UI PoC), legacy vanilla tree (common, api — not built)
+-- packages/                        Shared TypeScript packages (design-system, editor-common, etc.)
+-- integrations/                    Third-party integrations
+-- tests/                           E2E test suite (Jest + Playwright + Docker Compose)
+-- observability/                   Grafana, Prometheus, Loki, Tempo
+-- ci/                              Docker base images for CI
+-- .github/workflows/               CI/CD (ci, deploy, docker, release, security, wasm)
+-- .sisyphus/plans/                 Implementation plans
```

## RUST CRATES (core/crates/)

### Format Parsers (16 crates with FormatRoundtrip trait)
| Crate | Description |
|-------|-------------|
| wo-common | Shared types, errors, test harness |
| wo-txt | Plain text parser |
| wo-unicode | Encoding conversion (ICU-backed) |
| wo-fb2 | FictionBook 2.0 parser + serializer |
| wo-html | HTML import/export |
| wo-rtf | Rich Text Format parser + serializer |
| wo-epub | EPUB parser + serializer (ZIP-based) |
| wo-hwp | Korean HWP format parser |
| wo-djvu | DjVu document parser |
| wo-xps | XPS document parser |
| wo-ofd | Chinese OFD document parser |
| wo-odf | OpenDocument format parser + serializer (ZIP + XML) |
| wo-pdf | PDF reading/writing |
| wo-msbinary | OLE compound document parser to JSON |
| wo-ooxml | OOXML (DOCX/XLSX/PPTX) parser + serializer |
| wo-x2t | Format conversion orchestrator (60 registered converter pairs, chain support) |

### Rendering and Fonts (3 crates)
| Crate | Description |
|-------|-------------|
| wo-renderer | Canvas rendering engine (text layout, gradients, transforms) |
| wo-fonts | Font loading, caching, CSS-compliant matching |
| wo-raster | Image encode/decode (PNG, BMP) |

### WASM Targets (2 crates)
| Crate | Description |
|-------|-------------|
| wo-x2t-wasm | Format conversion compiled to WASM (wasm-bindgen) |
| wo-renderer-wasm | Canvas rendering compiled to WASM (Web Canvas bridge) |

### Protocol and Infrastructure (5 crates)
| Crate | Description |
|-------|-------------|
| wo-office-utils | ZIP/archive manipulation, ArchiveWriter |
| wo-docx-renderer | DOCX to PDF rendering pipeline |
| wo-wopi | WOPI protocol server (axum, CheckFileInfo/GetFile/PutFile) |
| wo-webdav | WebDAV server (axum, PROPFIND/MKCOL/PUT/DELETE/LOCK) |
| wo-docserver | Document server: serves editor UI, proxies WOPI requests to OCIS |

## SERVICES (services/)

| Service | Description |
|---------|-------------|
| api-gateway | Request routing |
| storage-service | File storage backend (CRUD endpoints, SQLite-backed metadata, disk blob storage) |
| conversion-service | Format conversion |
| coauthoring-service | Real-time collaboration |
| identity-service | Auth (JWT, OAuth2, SAML 2.0, OIDC, LDAP) |
| session-service | Session management |
| server | Main document server |

### Storage Service Details

`storage-service` has real CRUD implementation:
- SQLite-backed metadata persistence (files table: id, name, content_type, size, path, timestamps)
- Disk-based blob storage
- REST endpoints: POST /files (upload), GET /files (list), GET /files/{id} (metadata), GET /files/{id}/content (raw bytes), DELETE /files/{id}
- 7 repository unit tests covering insert, get, list, delete, and persistence across restarts

## ENTERPRISE SERVICES (services-enterprise/)

| Service | Description |
|---------|-------------|
| audit-service | Audit logging for enterprise compliance |
| scim-service | SCIM provisioning (user/group sync, LDAP integration) |
| webhook-service | Webhook dispatch for document events |

## WEB EDITORS (apps/web/)

The React editor apps were removed 2026-11-27 (see banner). What remains in `apps/web/apps/`:
- ribbon-leptos -- Leptos 0.8 + Trunk WASM ribbon PoC (Home tab only, not a workspace member)
- common, api -- legacy vanilla JS tree, not built, fate pending

Framework-agnostic packages in `packages/` under `@world-office` namespace:
- editor-common -- Editor controllers, ribbon specs (Leptos port source), plugin loader, utils
- editor-stores -- Editor state management
- design-system -- Design tokens only
- collaboration-client -- Collaboration protocol client
- sdk-bridge -- SDK bridge layer
- plugin-sdk -- Plugin SDK (types, validator, scaffold CLI)
- i18n -- Internationalization
- eslint-config -- Shared ESLint configuration
- tsconfig -- Shared TypeScript configuration

## INTEGRATIONS

| Integration | Path | Stack |
|-------------|------|-------|
| OpenCloud | integrations/opencloud/ | Node.js, EJS, Docker |
| Nextcloud | integrations/nextcloud/ | PHP (OCA\WorldOffice namespace) |
| Android | integrations/android/ | Android document editor app |
| Document Server | integrations/document-server-integration/ | Examples in C#, Go, Java, Node.js, PHP, Python, Ruby |

## E2E TEST SUITE (tests/)

Located in `tests/`. Tests the full document editing stack:
- Document Server (WOPI client)
- OCIS (ownCloud Infinite Scale, WOPI host)
- Companion (deployment dashboard)

Stack: Jest, Playwright, Docker Compose. Run with `npm test` or `npm run test:e2e`.

## BUILD SYSTEMS

| Component | Build | Command |
|-----------|-------|---------|
| Rust core | Cargo | `cargo build --workspace` |
| Rust tests | Cargo | `cargo test --workspace --lib -- --test-threads=1` |
| Rust lint | Clippy | `cargo clippy --workspace` |
| Web frontend | pnpm | `pnpm install && pnpm dev` |
| E2E tests | npm | `cd tests && npm test` |
| CI | GitHub Actions | `.github/workflows/` (ci, deploy, docker, release, security, wasm) |
| Security audit | Weekly (Monday 06:00 UTC) | `cargo audit` + `pnpm audit --audit-level=high` |

## CODE STYLE

- **Rust**: `cargo fmt` + `cargo clippy` -- follow existing patterns
- **TypeScript**: Biome (via `pnpm format` = `biome check --write .`), pnpm lint/typecheck via Turbo
- **Commits**: Conventional commits (feat:, fix:, docs:, test:, refactor:)
- Tests required for all code changes

## WINDOWS DEVELOPMENT

### WSL Workaround for dlltool Issue

Windows builds may fail with `error: calling dlltool 'dlltool.exe': program not found` when compiling windows-sys crates.

**Solution:** Use WSL to run Rust tests and builds:

```bash
# Run specific crate tests via WSL
wsl bash -c "cd /mnt/c/Users/Tobias/git/World-Office && ~/.cargo/bin/cargo test -p wo-html -p wo-rtf"

# Run full workspace tests via WSL
wsl bash -c "cd /mnt/c/Users/Tobias/git/World-Office && ~/.cargo/bin/cargo test --workspace"
```

### Past Issue: wo-pdf ICE (Resolved)

The wo-pdf crate previously triggered a Rust compiler ICE in older nightly versions. This is resolved with rustc >= 1.92.0. CI includes all 27 core crates.

## DOCUMENTATION (plan/)

The workspace-level `plan/` directory contains operational and developer documentation:

| Document | Description |
|----------|-------------|
| `plan/operations-runbook.md` | Production ops: deploy, monitoring, incident response, scaling |
| `plan/sso-configuration-guide.md` | SSO setup: SAML 2.0, OpenID Connect, LDAP |
| `plan/plugin-development-guide.md` | Plugin SDK: create, build, publish plugins |
| `plan/desktop-app-guide.md` | Tauri desktop: build, features, architecture |
| `plan/performance.md` | Baseline performance metrics and optimization targets |
| `plan/collaboration-service-deployment.md` | Coauthoring service deployment notes |

## ANTI-PATTERNS

- NEVER push to main without running `cargo test` on changed crates
- NEVER add new Rust dependencies without checking they compile on Windows (wasm-bindgen crates can be tricky)
- The WOPI server (wo-wopi) requires access tokens -- do not expose endpoints without auth
- WASM crates (wo-x2t-wasm, wo-renderer-wasm) cannot be tested with standard `cargo test` -- they need wasm-pack or a browser runtime
- pnpm workspace includes `apps/web/apps/*` -- editor changes propagate across all editor shells

## AGENTIC AI DEV LOOP (opencloud-docserver) — HISTORICAL

The agentic surface (`opencloud-docserver/src/ai/`) belonged to the REMOVED Python
docserver (decommissioned 2026-10-14 — source in git history; see the decommission
commit and `cf98bf78e` for the last state). Its spec-driven loop (OpenSpec changes,
parity/* branches, pytest + ruff + `scripts/mutation-test.py` 100% mutation gate,
eval corpora in `tests/test_ai_agent_edits.py` + `tests/golden/`) and the CI job
`docserver-mutation-gate` went with it. Direction + implementation record survives
in `plan/agentic-ai-direction.md` and `openspec/changes/agentic-ai-document-platform/`.
If the agent surface is resurrected on the Rust stack, start from those records.
