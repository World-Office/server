## Context

World-Office forked ONLYOFFICE DocumentServer with three architectural bets that diverge from upstream:
- **Rust core** replaces C++ format parsers — faster, safer, concurrent
- **React editors** replace vanilla JS web-apps — better component model, modern DX
- **MCP server** replaces the sdkjs-plugins system — open protocol, AI-native, general-purpose

The ONLYOFFICE gaps (plugins ecosystem, desktop app, mobile editors) need to be evaluated against these bets, not blindly ported. This design makes the strategic decisions explicit.

## Goals / Non-Goals

**Goals:**
- Define MCP-based extensibility as the plugin/story — open, protocol-driven, sandboxed
- Ship a production-grade Tauri desktop thin client around existing web editors
- Deliver responsive mobile viewing with light annotation (not full editing)
- Empower third-party developers to extend World-Office via the MCP protocol

**Non-Goals:**
- NOT porting sdkjs-plugins (architectural mismatch with React editors — DOM manipulation plugins break against React's virtual DOM)
- NOT building a native mobile editor app (expensive, niche use case)
- NOT matching ONLYOFFICE DesktopEditors feature-for-feature (10 years of C++/Qt development)
- NOT building a plugin marketplace with billing/auth (keep it simple: manifest registry + discovery)

## Decisions

### Decision 1: MCP as the extension mechanism (vs porting sdkjs-plugins)

**Status: ADOPTED**

| Option | Rationale |
|---|---|
| Port sdkjs-plugins | Plugins manipulate DOM directly — breaks React reconciliation. Would require a compatibility shim that negates all benefits of React. |
| Build new JS plugin API | Proprietary, only works for web editors. No server-side or AI integration. |
| **MCP-based extensibility** | Open protocol (growing ecosystem). Already have an MCP server with 14 tools. Extensible to any platform. AI-native. |

**How it works:**
- The existing `services/mcp-server/` becomes the plugin host
- Plugins ARE MCP servers — they register tools, communicate via the MCP protocol
- The web editor connects to MCP tools via a bridge (editor → MCP client → plugin servers)
- Result: any MCP-compatible tool extends World-Office, including AI tools, file converters, exporters, automation scripts

**Key implication:** World-Office's "plugin system" is the MCP ecosystem. Third-party developers write MCP servers in any language that supports the protocol.

### Decision 2: Tauri desktop as thin client (vs native editor)

**Status: ADOPTED**

| Option | Rationale |
|---|---|
| Build native editors (C++/Qt) | 10+ year effort to match ONLYOFFICE DesktopEditors. Not feasible. |
| Electron wrapper | Heavy (200MB+ per install), higher memory usage, security concerns. |
| **Tauri thin client** | Rust native (matches tech stack), lightweight (5-10MB), web editors run as-is. Only need native wrappers: file system access, tray, auto-update, window management. |

**How it works:**
- Tauri 2.0 shell loads web editors in a webview
- Existing `desktop/tauri-poc/` is the starting point (10 modules already: commands, menu, tray, window, state, filesystem, print, updater, keychain)
- Production requirements: code signing (macOS/Windows), auto-update infrastructure, native installers (DMG/MSI/AppImage), file association

### Decision 3: Responsive mobile viewing (vs mobile editing app)

**Status: ADOPTED**

| Option | Rationale |
|---|---|
| Full mobile editor (React Native/Web) | Expensive to build and maintain. Touch-based editing for complex documents (tables, pivot charts) is a poor UX. |
| Mobile-native app per platform | Not worth the cross-platform investment for World-Office's user base. |
| **Responsive CSS + annotation** | Leverage existing React editors. Add responsive breakpoints for mobile viewing. Add light annotation (highlight, comment) on mobile. No complex editing. |

**How it works:**
- CSS grid reflow for mobile viewports in each editor (document, spreadsheet, presentation, PDF)
- Simplified toolbar: only essentials visible on mobile
- Read-only by default on mobile, with annotation/toggle
- No touch-based cell/paragraph editing — mobile is for review and light feedback

### Decision 4: Deferred — plugin registry hosted in the app (not a marketplace)

**Status: ADOPTED**
- No centralized marketplace with billing/auth
- Plugins are discovered via a manifest registry (JSON feed or directory in the MCP server config)
- Users configure MCP tool endpoints in the admin panel
- Enterprise: private registries for internal tooling

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| MCP ecosystem is still young (protocol churn) | Use `rmcp` crate which tracks the spec. Abstract tool definitions behind a stable internal trait so protocol changes are localized. |
| Tauri auto-update on Linux is manual (AppImage) | Support AppImage + .deb + .rpm. Self-host the update server alongside the OpenCloud deployment companion. |
| Mobile viewing without editing may disappoint power users | Clear UX labeling: "View-only mode" with prominent "Open in Desktop" call-to-action. Track mobile edit demand via telemetry before investing. |
| Third-party MCP servers could be security risks | Plugin MCP servers run in separate processes. The editor MCP client validates tool schemas before calling. Future: WebAssembly sandboxing for untrusted plugins. |
