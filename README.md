<p align="center">
  <img src="https://codeberg.org/World-Office/artwork/raw/branch/main/assets/banner.png" alt="World-Office Banner" width="600">
</p>

<h1 align="center">World-Office</h1>

<p align="center">
  <strong>Independent, open-source document editing suite — Rust is back.</strong><br>
  Cloud-native. WOPI-first. Built for scale.
</p>

<p align="center">
  <a href="https://codeberg.org/World-Office/server">Repository</a> &
  <a href="https://codeberg.org/World-Office">Organization</a> &
  <a href="CODE_OF_CONDUCT.md">Code of Conduct</a> &
  <a href="CONTRIBUTING.md">Contributing</a> &
  <a href="SECURITY.md">Security</a> <br>
  <a href="https://codecov.io/gh/World-Office/server"><img src="https://codecov.io/gh/World-Office/server/branch/main/graph/badge.svg?style=flat-square" alt="Codecov"></a>
  <a href="https://codeberg.org/World-Office/server/actions"><img src="https://codeberg.org/World-Office/server/actions/workflows/ci.yml/badge.svg?style=flat-square" alt="CI"></a>
</p>

---

## ✨ We Are Back at Rust

> **YES, Rust is the future.** The Python `opencloud-docserver` experiment taught us that
> simplicity has value, but the performance, type-safety, and ecosystem depth of Rust
> are what World-Office needs to compete with commercial offerings.

This is a **cloud-first, Rust-based** document editing platform. The entire stack is designed
for containerized deployment, WOPI integration, and horizontal scaling. We're consolidating
all development efforts back into this Rust workspace.

---

## 🚀 What Is World-Office

World-Office is an independent, open-source document editing suite designed for the cloud era.

- **Rust Core**: 26 format parsers, canvas rendering, conversion pipeline, protocol servers
- **WOPI-First**: Native WOPI protocol support for OpenCloud, Nextcloud, SharePoint, and any WOPI-compliant host
- **Cloud-Native**: Docker-ready, Kubernetes-ready, stateless services where it matters
- **Format Agnostic**: DOCX, ODT, PDF, EPUB, HTML, RTF, and 15+ other formats
- **Real-Time Collaboration**: Co-authoring service built on CRDTs
- **Enterprise Ready**: Signatures, DRM, redaction, watermarking, comparison via enterprise crates

Everything is AGPL-3.0-or-later licensed. Enterprise extensions available under a separate
commercial license (see `LICENSE-COMMERCIAL`).

---

## 🏗️ Cloud Architecture

World-Office is built as a collection of **cloud-native microservices** that work together
to provide a complete document editing experience. All services are container-ready and
can be deployed independently or as a unified stack.

### Core Cloud Services

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Browsers                               │
│  (React-based Word, Sheets, Slides, PDF, Visio editors)                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        API Gateway (Rust)                              │
│                     ┌─────────────┐    ┌─────────────┐                  │
│                     │  WOPI Proxy │    │  REST API   │                  │
│                     └─────────────┘    └─────────────┘                  │
└───────────────────────────┬─────────────────┬───────────────────────────┘
                            │                 │
            ┌───────────────▼───────┐ ┌───────▼───────────────┐
            │  wo-docserver         │ │   identity-service   │
            │  (Document UI Host)  │ │   (AuthN/AuthZ)       │
            └───────────────┬───────┘ └───────┬───────────────┘
                            │                 │
                            ▼                 ▼
            ┌─────────────────────────────────────────────────────────────┐
            │                    WOPI Host / Storage                       │
            │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
            │  │ OpenCloud   │  │ Nextcloud   │  │ S3/MinIO            │ │
            │  │ (OCIS)      │  │             │  │ (Object Storage)    │ │
            │  └─────────────┘  └─────────────┘  └─────────────────────┘ │
            └─────────────────────────────────────────────────────────────┘
```

### Service Overview

| Service | Port | Description |
|---------|------|-------------|
| `api-gateway` | 8080 | Request routing, load balancing, rate limiting |
| `wo-docserver` | 8081 | Document editor UI + WOPI client proxy |
| `identity-service` | 8082 | JWT/OAuth2 authentication, session management |
| `storage-service` | 8083 | File metadata + blob storage backend |
| `conversion-service` | 8084 | Format-to-format conversion (27+ converters) |
| `coauthoring-service` | 8085 | Real-time collaborative editing (CRDT-based) |
| `admin-panel` | 8086 | Admin dashboard, monitoring, configuration |

### WOPI Integration

The **WOPI protocol** (Web Application Open Platform Interface) is at the heart of
World-Office's cloud strategy. We implement both sides:

- **WOPI Client** (`wo-wopi` crate): Connects to external WOPI hosts (OpenCloud, SharePoint, etc.)
- **WOPI Server** (`wo-docserver`): Hosts the editing experience and proxies to WOPI hosts

Supported WOPI endpoints:
- `CheckFileInfo` - Get document metadata and capabilities
- `GetFile` - Download file content
- `PutFile` - Upload/save file content
- `Lock` / `Unlock` - Co-authoring lock management
- `GetLock` - Check current lock status

---

## 📦 Rust Core (26 Crates)

The Rust core provides the foundation for all document operations.

### Format Parsers (16 crates with FormatRoundtrip trait)

| Crate | Description |
|-------|-------------|
| `wo-common` | Shared types, errors, test harness |
| `wo-txt` | Plain text parser |
| `wo-unicode` | Encoding conversion (ICU-backed) |
| `wo-fb2` | FictionBook 2.0 parser + serializer |
| `wo-html` | HTML import/export |
| `wo-rtf` | Rich Text Format parser + serializer |
| `wo-epub` | EPUB parser + serializer (ZIP-based) |
| `wo-hwp` | Korean HWP format parser |
| `wo-djvu` | DjVu document parser |
| `wo-xps` | XPS document parser |
| `wo-ofd` | Chinese OFD document parser |
| `wo-odf` | OpenDocument format parser + serializer (ZIP + XML) |
| `wo-pdf` | PDF reading and writing |
| `wo-msbinary` | OLE compound document parser to JSON |
| `wo-ooxml` | OOXML (DOCX/XLSX/PPTX) parser and serializer |
| `wo-x2t` | **Format conversion orchestrator** (27 native converters, chain support) |

### Rendering and Fonts (3 crates)

| Crate | Description |
|-------|-------------|
| `wo-renderer` | Canvas rendering engine (text layout, gradients, transforms) |
| `wo-fonts` | Font loading, caching, CSS-compliant matching |
| `wo-raster` | Image encode/decode (PNG, BMP) |

### WASM Targets (2 crates)

| Crate | Description |
|-------|-------------|
| `wo-x2t-wasm` | Format conversion compiled to WASM (wasm-bindgen) |
| `wo-renderer-wasm` | Canvas rendering compiled to WASM (Web Canvas bridge) |

### Cloud & Protocol (5 crates)

| Crate | Description |
|-------|-------------|
| `wo-office-utils` | ZIP/archive manipulation |
| `wo-docx-renderer` | DOCX to PDF rendering pipeline |
| `wo-wopi` | **WOPI protocol server** (axum, CheckFileInfo/GetFile/PutFile) |
| `wo-webdav` | **WebDAV server** (axum, PROPFIND/MKCOL/PUT/DELETE/LOCK) |
| `wo-docserver` | **Document server**: serves editor UI, proxies WOPI requests |

---

## 🌐 Web Editors

React-based editors for all document types, served from the Rust backend.

**Individual editors** (`apps/web/apps/`):
- `documenteditor-react` - Word processing
- `spreadsheeteditor-react` - Spreadsheets with formulas
- `presentationeditor-react` - Slides with animations
- `pdfeditor-react` - PDF viewing and annotation
- `visioeditor-react` - Diagram and flowchart editing

**Shared packages** (`packages/`):
- `@world-office/editor-common` - Shared editor logic
- `@world-office/editor-stores` - State management (MobX)
- `@world-office/design-system` - UI components
- `@world-office/collaboration-client` - Real-time sync
- `@world-office/i18n` - Translations

The presentation editor includes: shapes, text editing, undo/redo, clipboard,
property panels, multi-select, grouping, images, tables, charts, connectors,
slide backgrounds, animations, presenter view, and zoom.

---

## 🔧 Enterprise Extensions

Available under separate commercial license (`LICENSE-COMMERCIAL`).

**Enterprise core crates** (`core-enterprise/crates/`):
- `wo-digital-signature` - Document signing
- `wo-redaction` - Content redaction
- `wo-drm` - Digital rights management
- `wo-watermark` - Watermark insertion
- `wo-comparison` - Document comparison
- `wo-converter-pro` - Advanced conversion features

**Enterprise services** (`services-enterprise/`):
- `audit-service` - Comprehensive audit logging
- `scim-service` - SCIM 2.0 for identity provisioning
- `webhook-service` - Event-driven integrations

---

## 🚀 Quick Start (Cloud Deployment)

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/World-Office/server.git
cd server

# Build and start all cloud services
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d

# Access the admin panel at http://localhost:8086
# Editors are available at http://localhost:8081/editor/{document-id}
```

### Development Setup

```bash
# Build the entire Rust workspace
cargo build --workspace

# Run all Rust tests
cargo test --workspace --lib -- --test-threads=1

# Start individual services
cargo run -p wo-docserver -- --port 8081
cargo run -p api-gateway -- --port 8080
cargo run -p identity-service -- --port 8082

# Frontend (pnpm monorepo)
pnpm install
pnpm dev
```

### Kubernetes Deployment

```bash
# Helm chart available in deploy/charts/
helm install world-office deploy/charts/world-office -n world-office --create-namespace

# Or use kustomize
deploy/kustomize/overlay/production/ | kubectl apply -f -
```

---

## 🧪 Test Coverage

**930+ tests** across the Rust workspace:

- Format parsers: ~430 tests (16 crates)
- Rendering engine: ~125 tests (`wo-renderer`)
- Document server: ~45 tests (`wo-docserver`)
- Font system: ~36 tests (`wo-fonts`)
- Raster imaging: ~22 tests (`wo-raster`)
- Rendering pipeline: ~25 tests (`wo-docx-renderer`)
- Services: ~42 tests (storage, session, identity, conversion, coauthoring)

**E2E test suite** (`tests/`):
- Full document editing stack tests
- WOPI protocol compliance tests
- Collaboration scenario tests
- Using Jest + Playwright with Docker Compose

```bash
# Run all tests
cargo test --workspace --lib -- --test-threads=1

# Run E2E tests
docker compose -f docker-compose.yml -f docker-compose.test.yml up --abort-on-container-exit
```

---

## 📡 WOPI Host Integration

World-Office works with any WOPI-compliant host:

| Host | Integration Path | Status |
|------|-----------------|--------|
| OpenCloud (OCIS) | `integrations/opencloud/` | ✅ Production |
| Nextcloud | `integrations/nextcloud/` | ✅ Production |
| SharePoint Online | Native WOPI | ✅ Tested |
| OnlyOffice | Native WOPI | ✅ Tested |
| Custom WOPI Host | Native WOPI | ✅ Works |

---

## 🔄 Migration from opencloud-docserver

If you're currently using the Python `opencloud-docserver`:

1. **Decommission**: The Python docserver was a minimal experiment. Rust is production-ready.
2. **Deploy Rust**: Use the Docker Compose or Kubernetes instructions above.
3. **Configure WOPI**: Point to your existing WOPI host (OpenCloud, Nextcloud, etc.).
4. **Migrate Data**: If using local storage, migrate documents to the new storage-service.

Key differences:
- ✅ **Performance**: Rust handles 10x-100x more concurrent users
- ✅ **Formats**: 15+ formats vs. 2 (DOCX, ODT)
- ✅ **Features**: Full document fidelity, advanced rendering, collaboration
- ✅ **Ecosystem**: Native desktop apps, WASM, mobile support

---

## 🎯 Roadmap

See [ROADMAP.md](ROADMAP.md). Current focus areas:

1. **Cloud-Native Features** - Kubernetes operator, auto-scaling, service mesh
2. **WOPI 2.0 Compliance** - Full protocol support, certification
3. **Collaboration** - Improved CRDT implementation, presence indicators
4. **Performance** - Rendering optimization, memory management
5. **Enterprise** - Enhanced security, compliance, audit features

---

## 📚 Documentation

- [AGENTS.md](AGENTS.md) - Development workflow for contributing agents
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment guide
- [COLLABORATION_ANALYSIS.md](COLLABORATION_ANALYSIS.md) - Team collaboration patterns
- [ARTISTIC_PROPORTIONS.md](ARTISTIC_PROPORTIONS.md) - Design principles
- [docs/](docs/) - In-depth technical documentation
- [core/crates/wo-wopi/README.md](core/crates/wo-wopi/README.md) - WOPI protocol deep dive

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). We welcome contributions!

- Conventional commits required
- Tests required for all code changes
- Code review via pull requests
- Discussion in [World-Office Discussions](https://codeberg.org/World-Office/server/discussions)

---

## 🔒 Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities to world-office@graphwiz.ai.

---

## 📜 License

AGPL-3.0-or-later. See [LICENSE](LICENSE) for details.

Enterprise extensions are available under a separate commercial license (see `LICENSE-COMMERCIAL`).
