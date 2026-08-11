## 1. MCP Extension System — Core Infrastructure

- [x] 1.1 Extend MCP server (`services/mcp-server/`) with multi-server registry: `plugin_loader.rs` with `PluginRegistry` (Mutex<Vec<PluginConnection>>), each connection spawns child process + MCP handshake
- [x] 1.2 Add tool discovery endpoint to MCP server: `all_tools()` aggregates across built-in + plugin tools; `list_tools` handler returns combined list
- [x] 1.3 Implement MCP tool manifest registry: `PluginRegistryConfig` / `PluginServerConfig` loaded from `mcp-servers.json` (env var `MCP_PLUGIN_CONFIG`)
- [x] 1.4 Add process isolation: each plugin server is a child process (`tokio::process::Command`, `kill_on_drop: true`), with per-server timeout and env config
- [x] 1.5 Add MCP client-side library for editor integration: `mcp-client.ts` — TypeScript `McpClient` class with `listTools()`, `callTool()`, plus convenience methods for each built-in tool (listDocuments, getDocumentInfo, readDocument, createDocument, writeDocument, addComment, listComments)

## 2. MCP Extension System — Editor Bridge

- [x] 2.1 MCP bridge created (`lib/mcp-bridge.ts`): McpSession class with connect(), tools getter, invoke(), findTool(); McpClient fetches from HTTP API
- [x] 2.2 Tool trigger mechanism in Toolbar.tsx: "Tools" dropdown with available MCP tools listed, click invokes tool via McpSession
- [ ] 2.3 Tool result rendering: modal displays results (text rendering at cursor position needs editor-specific paste API integration)
- [ ] 2.4 Bridge tests: verify MCP connection lifecycle, tool execution, error handling, and result rendering

## 3. MCP Extension System — Admin Panel Configuration

- [x] 3.1 Add "MCP Tool Servers" page to admin-panel (`services/admin-panel/`): list/add/remove/test external MCP server connections — **DONE**: `routes/mcp/router.js` + `pages/McpConfig/index.js`
- [x] 3.2 Implement "Test Connection" flow: ping MCP server, list its tools, show success/error — **DONE**: POST /servers/test endpoint + in-page Test button with result display
- [x] 3.3 Persist MCP server configuration: save registered endpoints to server-side config file or database — **DONE**: PUT /servers stores via `runtimeConfigManager`

## 4. Desktop App — Tauri Thin Client

- [x] 4.1 Audit to Tauri 2.0 stable — **ALREADY DONE**: `tauri = "2"` in Cargo.toml, 10+ Rust modules compile (commands, menu, tray, window, state, filesystem, print, updater, keychain, bridge, health, plugins, settings)
- [x] 4.2 File associations — **ALREADY DONE**: 12 document formats configured in `tauri.conf.json` (docx, xlsx, pptx, pdf, odt, ods, odp, rtf, txt, html, epub, fb2)
- [x] 4.3 Auto-updater — **ALREADY DONE**: `updater.rs` with check_for_updates (fetches releases.json), install_update (download + SHA256 verify + platform installer run), status event emission
- [x] 4.4 Native file dialogs — **ALREADY DONE**: `tauri-plugin-dialog = "2"` in dependencies
- [x] 4.5 System tray — **ALREADY DONE**: tray icon with context menu (New/Open/Recent/Quit), window hide/show on close-to-tray
- [x] 4.6 Code signing: **UNSIGNED APPROACH** — `signingIdentity: null` and `certificateThumbprint: null` already configured. App builds and installs on all platforms without Apple Developer or Microsoft accounts. macOS: users get "unidentified developer" warning (Control-click → Open). Windows: SmartScreen warning (click "Run anyway"). Self-signed cert or real certs can be added later if needed.
- [x] 4.7 Native installers — **ALREADY DONE**: 6 bundle targets configured (nsis, deb, rpm, dmg, app, appimage) with per-platform config
- [x] 4.8 Desktop CI workflow — **ALREADY DONE**: `.forgejo/workflows/desktop-release.yml` with build-linux, test-desktop, release jobs; Debian repo publishing; appimage upload

## 5. Desktop App — Print and Keychain

- [x] 5.1 Print rendering — **ALREADY DONE**: `print.rs` implements print_document, print_preview, get_printers, get_page_sizes
- [x] 5.2 Credential storage — **ALREADY DONE**: `keychain.rs` implements store_credential, get_credential, delete_credential, list_credentials via keyring crate
- [ ] 5.3 Integration tests: verify file open/save roundtrip, auto-update notification fires, print preview renders, keychain store/retrieve works

## 6. Mobile Responsive Viewing

- [x] 6.1 Add responsive CSS breakpoints to all React editors: `mobile-responsive.css` with breakpoints <768px, collapsed toolbars, hidden side panels, editor-specific rules for doc/spreadsheet/presentation/PDF
- [x] 6.2 Implement read-only default mode on mobile: `useMobile` hook + `MobileContext` + `EditorLayout` integration, floating "Edit" button toggles read-only off
- [x] 6.3 Add mobile annotation support: `AnnotationOverlay` component with long-press context menu (Highlight / Comment), comment input modal, rendered highlight/comment markers wired into EditorLayout
- [x] 6.4 Add mobile gesture handling: `useTouchGestures` hook with swipe (dispatches `wo:swipe` events for slide navigation), pinch (`wo:pinch` for zoom), pan (`wo:pan` for scroll) — integrated into EditorLayout
- [ ] 6.5 Performance testing: verify 60fps scrolling, <3s first-page load on 4G, <500ms gesture response on target mobile devices — **MANUAL** (requires physical device testing)

## 7. Verification

- [ ] 7.1 Verify MCP extension system end-to-end: editor → MCP bridge → MCP server → external plugin → result back in document — **MANUAL** (requires running MCP server + plugin server + browser)
- [ ] 7.2 Verify desktop app: file open/save, auto-update, tray, native menus, print on all three platforms — **MANUAL** (requires OS-specific testing on macOS/Windows/Linux)
- [ ] 7.3 Verify mobile responsive: all four editors on mobile viewports, read-only default, annotation, performance targets — **MANUAL** (requires mobile device testing)
- [x] 7.4 No regression in existing features: `cargo test --workspace --lib -- --test-threads=1` passes — **370+ tests pass, 0 failures**
