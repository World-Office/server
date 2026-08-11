## Why

World-Office forked from ONLYOFFICE DocumentServer with a deliberate architectural bet: **Rust core instead of C++, React editors instead of vanilla JS, MCP/AI-native instead of plugin-grafted**. This change re-evaluates upstream feature gaps not as things to copy, but as strategic choices: where does it make sense to converge, where should we diverge and make something better, and what should we abandon entirely.

## What Changes

- **Rejected**: Porting sdkjs-plugins (architectural mismatch with React editors; MCP is the better extensibility story)
- **Deferred**: Full mobile editing (expensive, niche; mobile-viewing + annotation is sufficient)
- **Focused**: Tauri desktop app as thin native client around existing web editors (not a full native editor)
- **Evolved**: MCP server → general extensibility mechanism (replace the void left by sdkjs-plugins with something better)
- **Evolved**: Mobile responsive viewing experience for document/spreadsheet/presentation

## Capabilities

### New Capabilities
- `plugins-ecosystem`: MCP-based extensibility as the plugin system — any MCP-compatible tool extends World-Office, replacing the old sdkjs-plugins approach with an open, modern protocol
- `desktop-app`: Tauri-based thin desktop client that wraps web editors with native file integration, system tray, auto-update — not trying to match 10 years of ONLYOFFICE DesktopEditors
- `mobile-responsive`: Responsive viewing with light annotation for mobile browsers — not full editing, not touch-based editor UI

### Modified Capabilities
_(No existing specs have requirement changes — all are new capabilities)_

## Impact

- **`services/mcp-server/`**: Major role expansion from AI-tooling to general plugin/extension host. New capability: manifest registry, tool discovery, sandboxed execution
- **`desktop/tauri-poc/`**: Upgrade from PoC to production. CI/CD, native installers, code signing, auto-update, file association
- **`apps/web/apps/*-react/`**: Responsive CSS breakpoints and mobile-viewing mode for each editor
- **Strategic departure from upstream**: By choosing MCP over sdkjs-plugins, World-Office makes an explicit architectural bet that differs from ONLYOFFICE's plugin ecosystem
