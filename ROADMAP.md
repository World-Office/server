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
- ✅ **Shape Properties Panel (SS5)** — fill, stroke, position (x/y/w/h), font controls (family/size/bold/italic), Delete button
- ✅ **Undo/Redo (SS5)** — full history stack with 25 snapshot points across all mutation methods, Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts
- ✅ **Inline text editing (SS6)** — double-click to edit shapes, contentEditable overlay, auto-focus with cursor at end, Escape to cancel, blur auto-save, MobX auto-sync to Shape Panel
- ✅ **Clipboard (SS6)** — copy/cut/paste shapes with 30px offset on paste, HomeTab button wiring
- ✅ **Shape Rotation Handle (SS7)** — drag-to-rotate circle + connecting line on all 11 shape types, atan2-based angle delta, canvas transform
- ✅ **Shape Alignment Tools (SS7)** — 6-axis alignment (left/center/right/top/middle/bottom) in HomeTab Arrange dropdown, getSlideDimensions() helper
- ✅ **Distribute Tools (SS7)** — Distribute Horizontally/Vertically for 3+ selected shapes, even equal gap calculation
- ✅ **Multi-Select & Shape Grouping (SS8a)** — Shift-click multi-select (selectedShapeIds), Ctrl+A select-all, shape grouping/ungrouping, multi-drag
- ✅ **Image Upload (SS8a)** — Insert images from file via InsertTab Pictures button, image shape type with sizing/rotation handles
- ✅ **Slide Backgrounds (SS10)** — None/solid/gradient/image background types, color pickers, gradient angle slider in DesignTab
- ✅ **Tables on slides** — TableData types, SVG rendering, TablePicker popup, InsertTab wiring
- ✅ **PPTX full roundtrip (SS8b)** — WoPresentation↔PptxPresentation converter mit Coordinate-Mapping, Base64-Image-Encoding, Shape-Type-Mapping, Transition-Effect-Mapping, 216 Tests
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

## Codebase Hardening

### HTML Serializer Escaping
- ✅ **wo-html: Escape attribute values** — `"` → `&quot;`, `&` → `&amp;` in allen Attribut-Outputs (`format!(" ...=\"{}\"", v)`)
- ✅ **wo-html: Escape text content** — `<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;` in allen Text- und `InlineElement::Text`-Ausgaben
- ✅ **wo-html: Escape inline code** — `InlineElement::Code { content }` via `escape_text()`
- ✅ **wo-html: Escape `<pre>` und `<style>` content** — beide via `escape_text()`
- ✅ **wo-html: Escape Link/Image href/src** — via `escape_attr()`
- ✅ **wo-html: Roundtrip-Tests mit Sonderzeichen** — 39 Tests inkl. Sonderzeichen-Corpus
- ✅ **Audit aller anderen Serializer** (wo-rtf, wo-fb2, wo-odf, wo-ooxml, wo-epub) — wo-rtf fixed 3 unescaped spots, wo-odf fixed 4 unescaped spots in serialize_svg(), rest already properly escaped
