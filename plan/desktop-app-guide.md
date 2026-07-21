# World Office Desktop App Guide (Tauri)

**Version:** 1.0
**Date:** 2026-07-21
**Location:** `desktop/tauri-poc/`

---

## Overview

World Office ships as a native desktop application built with **Tauri 2.0**. The Tauri shell wraps the web-based editor UI with native OS capabilities: file system access, window management, system tray, auto-updates, and credential storage.

---

## Building

### Prerequisites

```bash
# Linux (Ubuntu/Debian)
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libssl-dev libayatana-appindicator3-dev

# macOS
xcode-select --install

# Windows
# Install Visual Studio Build Tools + WebView2 SDK
```

### Build Commands

```bash
cd desktop/tauri-poc

# Development mode (hot reload)
cargo tauri dev

# Production build
cargo tauri build

# Output:
#   Linux:   target/release/bundle/deb/   or   AppImage
#   macOS:   target/release/bundle/dmg/World-Office.dmg
#   Windows: target/release/bundle/msi/World-Office.msi
```

### Configuration

Tauri configuration lives in `desktop/tauri-poc/src-tauri/tauri.conf.json`:

```json
{
  "productName": "World Office",
  "version": "0.1.0",
  "identifier": "app.world-office.desktop",
  "build": {
    "frontendDist": "../../apps/web/apps/editor-shell/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "World Office",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  }
}
```

---

## Features

### Window State Persistence

Window size, position, and maximized state are automatically saved and restored across sessions:

```rust
// Desktop state (x, y, width, height, maximized)
// Persisted to app data directory on window close
// Restored on next app launch
```

**How it works:**
1. On window close → save position, size, and maximized state to JSON file
2. On window create → read saved state and apply
3. Handles multi-monitor edge cases (window off-screen → reset to center)

### Native File Dialogs

Open and save documents using native OS dialogs:

```bash
# JavaScript API (via Rust-to-JS bridge)
await window.__TAURI__.invoke("open_file_dialog", { filter: "documents" })
await window.__TAURI__.invoke("save_file_dialog", { defaultPath: "document.docx" })
```

**Supported file types:**
- Documents: `.docx`, `.odt`, `.rtf`, `.txt`, `.html`, `.epub`, `.fb2`
- Spreadsheets: `.xlsx`, `.ods`
- Presentations: `.pptx`, `.odp`
- PDF: `.pdf`
- Visio: `.vsdx`

### Recent Files

The **File → Open Recent** menu tracks the 10 most recently opened files:

```typescript
// State management
interface RecentFile {
  path: string
  name: string
  lastOpened: string  // ISO timestamp
}
```

- Automatically updated on file open
- Persisted to disk
- "Clear Recent" option in menu

### System Tray

The app minimizes to the system tray with context menu:

```
World Office
─────────────
Show Window
New Document
─────────────
Quit
```

### Auto-Updater

Automatic updates via Tauri updater plugin:

```rust
// Checks for updates on startup
// Downloads and applies updates in the background
// Prompts user to restart on completion
```

**Update server configuration:**
```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://updates.world-office.app/{{target}}/{{current_version}}"],
      "pubkey": "your-updater-public-key"
    }
  }
}
```

### Credential Storage

Passwords and tokens stored securely via OS keychain:

```rust
// Uses the keyring crate
// Linux: Secret Service (libsecret)
// macOS: Keychain
// Windows: Credential Manager
```

---

## Architecture

```
┌──────────────────────────────────┐
│         Tauri Shell              │
│  ┌────────────────────────────┐  │
│  │   WebView (Editor UI)      │  │
│  │   - React frontend         │  │
│  │   - WASM format engine     │  │
│  └──────────┬─────────────────┘  │
│             │ invoke()           │
│  ┌──────────▼─────────────────┐  │
│  │   Rust Backend             │  │
│  │                            │  │
│  │  commands.rs  ──────────── │  │
│  │  filesystem.rs ─────────── │  │
│  │  window.rs    ──────────── │  │
│  │  menu.rs      ──────────── │  │
│  │  tray.rs      ──────────── │  │
│  │  state.rs     ──────────── │  │
│  │  print.rs     ──────────── │  │
│  │  updater.rs   ──────────── │  │
│  │  keychain.rs  ──────────── │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### Module Overview

| Module | File | Description |
|--------|------|-------------|
| Commands | `commands.rs` | Document operations (new, open, save, zoom, fullscreen) |
| Filesystem | `filesystem.rs` | 13 native filesystem commands (Rust-to-JS bridge) |
| Window | `window.rs` | Multi-window management |
| Menu | `menu.rs` | Application menus (File/Edit/View/Help) |
| Tray | `tray.rs` | System tray with context menu |
| State | `state.rs` | AppState with recent files, window count |
| Print | `print.rs` | Print support (render, preview, page sizes) |
| Updater | `updater.rs` | Auto-updater |
| Keychain | `keychain.rs` | Credential storage |

---

## Development

### Running in Dev Mode

```bash
cd desktop/tauri-poc

# Terminal 1: Start web dev server
pnpm dev --filter=editor-shell

# Terminal 2: Start Tauri with hot reload
cargo tauri dev
```

### Debugging

```bash
# Enable verbose logging
RUST_LOG=debug cargo tauri dev

# Open DevTools in production build (tauri.conf.json)
{
  "app": {
    "windows": [{
      "devtools": true
    }]
  }
}
```

### Hot Reload

The Tauri dev server supports hot reload for both the Rust backend and WebView frontend. Changes to Rust code require rebuild (triggered automatically by `cargo tauri dev`).

---

## CI Notes

The Tauri build is **excluded from CI** because it requires system libraries (`libwebkit2gtk-4.1-dev`) not available in the CI runner. To build in CI:

```yaml
- name: Install Tauri deps
  run: |
    sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev \
      librsvg2-dev patchelf libayatana-appindicator3-dev

- name: Build Tauri
  run: cargo tauri build
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `libwebkit2gtk-4.1-dev` not found | Missing system dependency | Install via `apt` (see Prerequisites) |
| WebView blank | Frontend build missing | Run `pnpm build` first or use `cargo tauri dev` |
| File dialog returns error | Permissions not configured | Check capabilities in `tauri.conf.json` |
| Window position resets | State file corrupted | Delete `~/.local/share/app.world-office.desktop/state.json` |
| Update check fails | Wrong update endpoint | Verify `updater.endpoints` URL |
| Credential store error | Missing libsecret on Linux | Install `libsecret-1-dev` |
