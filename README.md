<p align="center">
  <img src="https://codeberg.org/World-Office/artwork/raw/branch/main/assets/banner.png" alt="World-Office Banner" width="600">
</p>

<h1 align="center">World-Office</h1>

<p align="center">
  <strong>Independent, open-source document editing suite.</strong><br>
  Built in Rust and TypeScript.
</p>

<p align="center">
  <a href="https://codeberg.org/World-Office/server">Repository</a> &
  <a href="https://codeberg.org/World-Office">Organization</a> &
  <a href="CODE_OF_CONDUCT.md">Code of Conduct</a> &
  <a href="CONTRIBUTING.md">Contributing</a> &
  <a href="SECURITY.md">Security</a>
</p>

---

## What Is This

World-Office is an independent, open-source document editing suite. The core is written in Rust: format parsers for 15+ document formats, a canvas rendering engine, a format conversion pipeline, and protocol servers (WOPI, WebDAV). The web editors and desktop shell use TypeScript and React. Everything is AGPL-3.0-or-later licensed.

## Architecture

```
server/
+-- core/crates/                  26 Rust crates (format parsers, renderer, WASM, protocols)
+-- core-enterprise/crates/       5 enterprise Rust crates (signatures, DRM, redaction, watermark, comparison)
+-- desktop/tauri-poc/            Tauri 2.0 desktop shell (10 modules)
+-- services/                     8 Rust microservices (gateway, storage, identity, conversion, ...)
+-- services-enterprise/          3 enterprise services (audit, SCIM, webhooks)
+-- apps/web/                     Document, spreadsheet, presentation, PDF, and Visio editors
+-- apps/web/apps/                React-based editor shells (documenteditor-react, etc.)
+-- packages/                     Shared TypeScript packages (design-system, editor-common, ...)
+-- integrations/                 OpenCloud (Node.js), Nextcloud (PHP), Android, document-server-integration
+-- tests/                        E2E test suite (Jest + Playwright + Docker Compose)
+-- observability/                Grafana, Prometheus, Loki, Tempo
+-- .forgejo/workflows/           CI/CD (ci, docker, release, security, wasm)
```

## Document Server Architecture

The Document Server (`wo-docserver`) is a Rust-based WOPI client that replaces the former C++ Document Server.

### Responsibilities:
- **WOPI Client**: Implements CheckFileInfo, GetFile, PutFile WOPI endpoints
- **Editor UI Hosting**: Serves React-based editors from `apps/web/apps/`
- **WOPI Discovery Proxies**: Proxies `/hosting/discovery` and `/hosting/wopi/*` to WOPI host
- **Format Conversion**: Backend for `wo-x2t` format conversion orchestration

### Key Differences from C++ Document Server:
- **Language**: Rust (axum/tokio) instead of C++
- **Build Time**: ~5-10 minutes instead of 2-4 hours
- **Editor UI**: React-based editors from monorepo instead of compiled JavaScript
- **Deploy**: Single binary or Docker container

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Browser                         │
│  (React Document/Spreadsheet/Presentation Editors)          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/HTTPS
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              wo-docserver (Rust)                            │
│  ┌──────────────────┬────────────────────────────────────┐ │
│  │  WOPI Client      │  Editor UI Hosting                │ │
│  │  - CheckFileInfo │  - /hosting/wopi/*                 │ │
│  │  - GetFile       │  - /hosting/discovery (proxy)     │ │
│  │  - PutFile       │  - Serves React apps from apps/    │ │
│  └────────┬─────────┴────────┬───────────────────────────┘ │
│           │                  │                              │
│           │ WOPI protocol    │                              │
└───────────┼──────────────────┼──────────────────────────────┘
            │                  │
        ┌───▼──────────────────▼────┐
        │   WOPI Host (OCIS)        │
        │   - File storage           │
        │   - WOPI discovery         │
        │   - Auth (built-in IDP)    │
        └────────────────────────────┘
```

**Request Flow:**
1. Browser requests `http://docserver:8080/hosting/wopi/word/edit?wopisrc=...`
2. wo-docserver serves React editor UI with embedded `WOPISrc` parameter
3. Editor loads and makes WOPI requests to `/wopi/files/{id}/`, `/wopi/files/{id}/contents/`
4. wo-docserver proxies these to OCIS (WOPI host) with JWT authentication
5. OCIS returns file metadata/content, wo-docserver forwards to editor

## Rust Core (26 Crates)

### Format Parsers (16 crates)

| Crate | What It Does |
|-------|-------------|
| `wo-common` | Shared types, error types, test harness |
| `wo-txt` | Plain text parser |
| `wo-unicode` | Encoding conversion (ICU-backed) |
| `wo-fb2` | FictionBook 2.0 parser and serializer |
| `wo-html` | HTML import/export |
| `wo-rtf` | Rich Text Format parser and serializer |
| `wo-epub` | EPUB parser and serializer (ZIP-based) |
| `wo-hwp` | Korean HWP format parser |
| `wo-djvu` | DjVu document parser |
| `wo-xps` | XPS document parser |
| `wo-ofd` | Chinese OFD document parser |
| `wo-odf` | OpenDocument format parser and serializer (ZIP + XML) |
| `wo-pdf` | PDF reading and writing |
| `wo-msbinary` | OLE compound document parser to JSON |
| `wo-ooxml` | OOXML (DOCX/XLSX/PPTX) parser and serializer |
| `wo-x2t` | Format conversion orchestrator (27 native converters, chain support) |

### Rendering and Fonts (3 crates)

| Crate | What It Does |
|-------|-------------|
| `wo-renderer` | Canvas rendering engine (text layout, gradients, transforms) |
| `wo-fonts` | Font loading, caching, CSS-compliant matching |
| `wo-raster` | Image encode/decode (PNG, BMP) |

### WASM Targets (2 crates)

| Crate | What It Does |
|-------|-------------|
| `wo-x2t-wasm` | Format conversion compiled to WASM (wasm-bindgen) |
| `wo-renderer-wasm` | Canvas rendering compiled to WASM (Web Canvas bridge) |

### Protocol and Infrastructure (5 crates)

| Crate | What It Does |
|-------|-------------|
| `wo-office-utils` | ZIP/archive manipulation |
| `wo-docx-renderer` | DOCX to PDF rendering pipeline |
| `wo-wopi` | WOPI protocol server (axum, CheckFileInfo/GetFile/PutFile) |
| `wo-webdav` | WebDAV server (axum, PROPFIND/MKCOL/PUT/DELETE/LOCK) |
| `wo-docserver` | Document server: serves editor UI, proxies WOPI requests to OCIS |

## Services (8 Microservices)

| Service | What It Does |
|---------|-------------|
| `api-gateway` | Request routing |
| `storage-service` | File storage backend (CRUD endpoints, SQLite-backed metadata, disk blob storage) |
| `conversion-service` | Format conversion |
| `coauthoring-service` | Real-time collaboration |
| `identity-service` | Authentication (JWT, OAuth2) |
| `session-service` | Session management |
| `server` | Main document server |
| `admin-panel` | Admin dashboard |

## Enterprise Extensions

Enterprise crates and services are available under a separate license (see `LICENSE-COMMERCIAL`).

**Core crates** (`core-enterprise/crates/`): `wo-digital-signature`, `wo-redaction`, `wo-drm`, `wo-watermark`, `wo-comparison`, `wo-converter-pro`

**Services** (`services-enterprise/`): `audit-service`, `scim-service`, `webhook-service`

## Desktop

The `desktop/tauri-poc/` directory contains a Tauri 2.0 desktop shell with 10 Rust modules:

commands.rs, menu.rs, tray.rs, window.rs, state.rs, filesystem.rs, print.rs, updater.rs, keychain.rs, and window helpers.

## Web Editors

The `apps/web/` directory contains the document editing frontend. Individual editors live in `apps/web/apps/`:

documenteditor, documenteditor-react, spreadsheeteditor, spreadsheeteditor-react, presentationeditor, presentationeditor-react, pdfeditor, pdfeditor-react, visioeditor, visioeditor-react

The **presentation editor** includes a full slides editor with: shape drawing (8 types), drag-move/resize/rotate, inline text editing, undo/redo, clipboard, shape properties panel (fill, stroke, position, font), shape alignment (6-axis), z-order arrange, tables, charts (bar/column/line/pie/doughnut), connectors, animations & transitions, presenter view, and zoom controls. Built with React + MobX.

Shared packages live in `packages/` under the `@world-office` namespace: `editor-common`, `editor-stores`, `design-system`, `collaboration-client`, `collaboration-react`, `sdk-bridge`, `i18n`, `eslint-config`, `tsconfig`.

## Integrations

| Integration | Path | What It Does |
|-------------|------|-------------|
| OpenCloud | `integrations/opencloud/` | Docker-based document server deployment (Node.js, EJS) |
| Nextcloud | `integrations/nextcloud/` | Nextcloud app (PHP, OCA\WorldOffice namespace) |
| Android | `integrations/android/` | Android document editor app |
| Document Server | `integrations/document-server-integration/` | Examples in C#, Go, Java Spring, Node.js, PHP Laravel, Python, Ruby |

## Test Coverage

930+ tests across the Rust workspace:

```
Format parsers:       ~430 tests (16 crates)
Rendering engine:     ~125 tests (wo-renderer)
Document server:       ~45 tests (wo-docserver)
Font system:           ~36 tests (wo-fonts)
Raster imaging:        ~22 tests (wo-raster)
Rendering pipeline:    ~25 tests (wo-docx-renderer)
Services:              ~42 tests (storage, session, identity, conversion, coauthoring)

Run:  cargo test --workspace --lib -- --test-threads=1
```

E2E test suite in `tests/` covers the full document editing stack (Document Server, OCIS, Companion) using Jest and Playwright with Docker Compose.

## CI/CD

Forgejo Actions runs on every push and PR (`.forgejo/workflows/`):

- **ci.yml** -- Rust lint (fmt + clippy), Rust tests, TypeScript lint/typecheck/build
- **docker.yml** -- Container image builds
- **release.yml** -- Release pipeline
- **security.yml** -- Security audits
- **wasm.yml** -- WASM crate builds

## Quick Start

```sh
git clone https://codeberg.org/World-Office/server.git
cd server

# Build Rust core
cargo build --workspace

# Run Rust tests
cargo test --workspace --lib -- --test-threads=1

# Frontend (pnpm monorepo)
pnpm install
pnpm dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Uses conventional commits, requires tests for all code changes.

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities to world-office@graphwiz.ai.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) for details. Enterprise extensions are available under a separate commercial license (see `LICENSE-COMMERCIAL`).
