# World Office — Feature Roadmap

## Completed (All Major Plans)

- [x] Rust core rewrite — 25 format parser crates + rendering + fonts + WASM
- [x] Tauri 2.0 desktop shell (10 modules)
- [x] wo-x2t conversion engine (27 native converters, 166 tests)
- [x] Collaboration WebSocket client (diamond-types CRDT)
- [x] Codeberg CI/CD (Forgejo Actions, 5 workflows)
- [x] E2E test suite (Jest + Playwright + Docker Compose, 19+ test files)
- [x] World-Office OpenCloud deployment companion (11 tasks)
- [x] Phase 2: Small format serializers (XPS, OFD, HWP, DjVu)
- [x] Phase 4: Web UI migration (all phases 4A-4G)
- [x] History cleanup — removed ~15k old C++ files, replaced all branding

## Completed

- [x] MCP Server + Version Snapshots
- [x] Comments with @agent Mentions
  - Unified comment system across documents
  - @agent mention support (agents can be @mentioned in comments)
  - Comment threads with reply chains
- [x] Cross-document ContentLink
  - REST API in storage-service (create/list/resolve/delete)
  - MCP server tools (create_contentlink, list_contentlinks, resolve_contentlink)
  - React ContentLink panel in document editor
  - Content preview via lazy resolution

## Tier 3 — Future

### Slides Editor
- ✅ **MVP (2026-06):** Slide manager, text + image content editing, basic PPTX roundtrip, speaker notes
- ✅ **Theme & master slide support** — full-stack Rust + React with 5 built-in presets
- ✅ **Animations & transitions** — TransitionsTab, AnimationTab, animation pane, CSS preview
- ✅ **Charts on slides** — bar, column, line, pie, doughnut SVG rendering with ChartTypePicker
- ✅ **Presenter view** — full-screen mode, keyboard nav, speaker notes, next preview, timer
- ✅ **Shapes & SmartArt** — 8 shape types, drag-move, resize handles, arrange, gallery picker
- ✅ **Tables on slides** — TableData types, SVG rendering, TablePicker popup, InsertTab wiring
- ❐ PPTX full roundtrip (100% OOXML schema coverage)
- ❐ ODP import/export
- ❐ Realtime coauthoring for presentations

### Flowchart Editor
- Visual flowchart/diagram editor
- Node-based editing with connections
- Export to SVG, PNG

### Extended Format Support
- XLSX spreadsheet editing
- PPTX presentation editing
- Enhanced ODF spreadsheet/presentation support
