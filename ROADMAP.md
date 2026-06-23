# World Office — Roadmap 2026 Q3 – 2027 Q2

**Generated:** 2026-06-23
**Previous plans archived:** `plan/archive/`

---

## Phase 1 — Production Release v1.0.0 (Q3 2026)

The project has all features. Now we ship.

### Desktop Distribution
- [ ] Set up Debian/APT repository on Codeberg Pages (shell script exists, needs cron job)
- [ ] GPG signing key management doc
- [ ] Publish first `.deb` release to world-office.codeberg.page/desktop-releases/
- [ ] Verify `updater.rs` auto-update flow end-to-end (check → download → install)
- [ ] Build .AppImage release (portable Linux)
- [ ] Build .rpm release (Fedora/openSUSE)

### Release Engineering
- [ ] Tag v1.0.0 with release notes (changelog generated from conventional commits)
- [ ] Set up release checklist: `cargo test --workspace` ✓ → `pnpm typecheck` ✓ → tag → publish
- [ ] Verify Forgejo release workflow fires correctly
- [ ] Publish crates.io crates for reusable Rust libraries (wo-common, wo-odf, wo-fonts, wo-renderer)

### Bug-Squash Sprint
- [ ] Fix 3 failing conversion-service tests (pre-existing test assertion mismatches)
- [ ] Fix `wo-ooxml` unused-assignment warnings (4 occurrences)
- [ ] Complete webdav CI documentation cleanup
- [ ] Audit `wopi-client` package — create source files or remove empty stub
- [ ] Track upstream rustc ICE fix for `wo-pdf`; unblock when available

### Observability & Operations
- [ ] Deploy Grafana dashboards for all 8 services
- [ ] Set up health-check endpoints in every service (axum `/health`)
- [ ] Structured logging via tracing (JSON output for production)
- [ ] Loki log aggregation

---

## Phase 2 — Desktop & Mobile (Q4 2026)

### macOS Desktop Build
- [ ] `.dmg` build target in Tauri config
- [ ] macOS signing (Apple Developer Program)
- [ ] Test all 10+ Rust modules on macOS (filesystem, keychain, print, tray)
- [ ] CI pipeline for macOS builds

### Windows Desktop Build
- [ ] `.msi` build target in Tauri config
- [ ] Windows signing
- [ ] Handle WSL dlltool workaround in CI (see AGENTS.md)
- [ ] Test filesystem bridge (drive letters, network shares)
- [ ] CI pipeline for Windows builds

### Android App
- [ ] Audit current Android integration (`integrations/android/`) — what stack, what's missing
- [ ] Tauri mobile target for Android
- [ ] Touch-optimized editor UI (gestures, pinch-zoom)
- [ ] File picker integration (SAF / content URI)
- [ ] Play Store listing prep

### iOS App
- [ ] Tauri mobile target for iOS
- [ ] Apple developer account setup
- [ ] Touch-optimized editor (shared with Android)
- [ ] File provider extension (Files app integration)
- [ ] TestFlight distribution

### Offline Editing
- [ ] Service Worker cache strategy for editor assets
- [ ] Local IndexedDB persistence for documents (autosave + conflict detection)
- [ ] Coauthoring CRDT conflict resolution when connectivity returns
- [ ] Offline indicator UI + sync progress

---

## Phase 3 — Enterprise & Ecosystem (Q1 2027)

### Production Services
- [ ] Deploy `audit-service` — log all document operations with tamper-evident chain
- [ ] Deploy `scim-service` — user provisioning with Okta/Azure AD
- [ ] Deploy `webhook-service` — event-driven integration (Slack, Teams, custom)
- [ ] SSO/SAML/OIDC support in `identity-service`
- [ ] Rate limiting + API key management in `api-gateway`

### Enterprise Features (UI)
- [ ] Digital signature panel in document editor (backend exists in wo-digital-signature)
- [ ] Document redaction UI (backend exists in wo-redaction)
- [ ] Watermark editor (backend exists in wo-watermark)
- [ ] Document comparison view (backend exists in wo-comparison)
- [ ] DRM policy configuration UI (backend exists in wo-drm)

### Self-Hosted Deployment
- [ ] Docker Compose production stack (all 8 services + enterprise + observability)
- [ ] Helm chart for Kubernetes
- [ ] Backup & restore documentation
- [ ] Migration guide from ONLYOFFICE / Collabora

### Plugin Ecosystem
- [ ] Plugin manifest spec (metadata, permissions, entry points)
- [ ] Plugin runtime sandbox (iframe-based)
- [ ] Plugin store UI (browse, install, manage)
- [ ] API docs for plugin developers
- [ ] Example plugins: spellcheck, grammar, translation, table of contents

---

## Phase 4 — AI & Advanced Features (Q2 2027)

### AI Assistant
- [ ] Inline AI writing assistant (suggestions, rephrase, summarize)
- [ ] Smart formatting (detect headings, lists, tables from paste)
- [ ] Image generation / alt-text generation
- [ ] Document Q&A (RAG over opened documents)
- [ ] Plugin hooks for custom AI backends (OpenAI-compatible API)

### Performance
- [ ] WASM optimization: profile `wo-x2t-wasm` bundle size, tree-shake
- [ ] Virtual scrolling for spreadsheet (handle 100k+ rows)
- [ ] Lazy-load editor packages (per-file-type editor loading)
- [ ] Rust core benchmark suite (`cargo bench`)
- [ ] CDN caching strategy for WASM binaries

### Internationalization
- [ ] Complete i18n coverage for all 6 editors
- [ ] RTL layout support (Arabic, Hebrew, Persian)
- [ ] CJK font fallback pipeline in `wo-fonts`
- [ ] Locale-aware number/date formatting in editors
- [ ] Translation platform (Weblate / Crowdin)

### Advanced Format Support
- [ ] CAD format import (DXF, DWG) in visioeditor
- [ ] Medical imaging (DICOM) viewer
- [ ] Markdown roundtrip (import/export with full formatting)
- [ ] PDF editing (text selection, annotation, form fill)
- [ ] Enhanced OOXML compatibility (smart art rendering in PPTX)

### Template Gallery
- [ ] Template format spec (`.wot` — World Office Template)
- [ ] Built-in template library (resumes, letters, reports, presentations)
- [ ] Template marketplace UI (community uploads)
- [ ] Template variables engine (merge fields, conditional sections)

---

## Stretch Goals (Backlog)

- [ ] **Federated collaboration** — connect two World-Office instances for cross-org editing
- [ ] **Version history UI** — visual diff, restore, branch (storage-service has file CRUD, needs versioned layers)
- [ ] **Self-updating CI** — renovate/dependabot for Rust + npm dependencies
- [ ] **CLI tool** — `wo` command-line: `wo convert`, `wo diff`, `wo extract-text`
- [ ] **Browser extension** — edit .docx files directly in browser (WOPI client)
- [ ] **Community docs site** — world-office.dev with tutorials, API ref, changelog
- [ ] **Fuzzing harness** — `cargo fuzz` for all format parsers
- [ ] **Sandboxed rendering** — run wo-renderer in Web Worker (off-main-thread)
- [ ] **Contribution guide** — CONTRIBUTING.md with onboarding, coding standards, PR workflow
- [ ] **OpenCollective / GitHub Sponsors** — funding page

---

## How to Use This Roadmap

1. Each phase is a 3-month horizon. Dates are guidance, not deadlines.
2. Items are ordered by priority within each phase.
3. Checkboxes are tracked as we go. No checkbox gets checked without verification.
4. Stretch goals are aspirational — pick up when main items are green.
5. If external blockers emerge (rustc ICE, Apple developer account), bubble them here.
