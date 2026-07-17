# World-Office WORKSPACE

**Updated:** 2026-04-19
**Source:** codeberg.org/World-Office/server (independent project)
**License:** AGPL-3.0-or-later (enterprise extensions in separate private repo)
**Crate count:** 26 core + 8 services
**Rust edition:** 2024 (nightly in CI, stable for releases)

## OVERVIEW

World-Office is an independent, open-source document editing suite built in Rust + TypeScript. The Rust core implements format parsing, rendering, conversion, WOPI/WebDAV protocols, desktop (Tauri), and WASM/browser targets. The TypeScript monorepo (pnpm) provides React-based document, spreadsheet, presentation, PDF, and Visio editors.

## STRUCTURE

```
server/
+-- core/crates/                     26 Rust crates (format parsers, renderer, WASM, protocols)
+-- desktop/tauri-poc/               Tauri 2.0 desktop shell (10 modules)
+-- services/                        8 Rust microservices
+-- apps/web/                        Web editor frontend (editors, themes, translations)
+-- apps/web/apps/                   Individual editor apps (documenteditor-react, spreadsheeteditor-react, etc.)
+-- packages/                        Shared TypeScript packages (design-system, editor-common, etc.)
+-- integrations/                    Third-party integrations
+-- tests/                           E2E test suite (Jest + Playwright + Docker Compose)
+-- observability/                   Grafana, Prometheus, Loki, Tempo
+-- ci/                              Docker base images for CI
+-- .forgejo/workflows/              CI/CD (ci, docker, release, security, wasm)
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
| wo-x2t | Format conversion orchestrator (27 native converters, chain support) |

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
| identity-service | Auth (JWT, OAuth2) |
| session-service | Session management |
| server | Main document server |
| admin-panel | Admin dashboard |

### Storage Service Details

`storage-service` has real CRUD implementation:
- SQLite-backed metadata persistence (files table: id, name, content_type, size, path, timestamps)
- Disk-based blob storage
- REST endpoints: POST /files (upload), GET /files (list), GET /files/{id} (metadata), GET /files/{id}/content (raw bytes), DELETE /files/{id}
- 7 repository unit tests covering insert, get, list, delete, and persistence across restarts

## ENTERPRISE SERVICES (services-enterprise/)

| Service | Description |
|---------|-------------|

## TAURI DESKTOP (desktop/tauri-poc/)

10 Rust modules providing native desktop functionality:
- commands.rs -- Document operations (new, open, save, zoom, fullscreen)
- menu.rs -- Application menus (File/Edit/View/Help) using Tauri 2.0
- tray.rs -- System tray with context menu
- window.rs -- Multi-window management
- state.rs -- AppState with recent files, window count
- filesystem.rs -- 13 native filesystem commands (Rust to JS bridge)
- print.rs -- Print support (render, preview, page sizes)
- updater.rs -- Auto-updater (Tauri updater plugin)
- keychain.rs -- Credential storage (keyring crate)

## WEB EDITORS (apps/web/)

Editor apps in `apps/web/apps/`:
- documenteditor, documenteditor-react
- spreadsheeteditor, spreadsheeteditor-react
- presentationeditor, presentationeditor-react
- pdfeditor, pdfeditor-react
- visioeditor, visioeditor-react
- api, common, editor-shell

Shared packages in `packages/` under `@world-office` namespace:
- editor-common -- Shared React components and utilities for editors
- editor-stores -- Editor state management
- design-system -- Tokens, theme, and primitive components
- collaboration-client -- Collaboration protocol client
- collaboration-react -- React bindings for collaboration
- sdk-bridge -- SDK bridge layer
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
| Tauri desktop | Cargo + npm | `cd desktop/tauri-poc && cargo tauri dev` |
| Web frontend | pnpm | `pnpm install && pnpm dev` |
| E2E tests | npm | `cd tests && npm test` |
| CI | Forgejo Actions | `.forgejo/workflows/` (ci, docker, release, security, wasm) |
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

## ANTI-PATTERNS

- NEVER push to main without running `cargo test` on changed crates
- NEVER add new Rust dependencies without checking they compile on Windows (wasm-bindgen crates can be tricky)
- The WOPI server (wo-wopi) requires access tokens -- do not expose endpoints without auth
- WASM crates (wo-x2t-wasm, wo-renderer-wasm) cannot be tested with standard `cargo test` -- they need wasm-pack or a browser runtime
- pnpm workspace includes `apps/web/apps/*` -- editor changes propagate across all editor shells
