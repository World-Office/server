# World Office Desktop — Installation Guide

## Supported Platforms

| Platform | Status | Method |
|----------|--------|--------|
| Linux (Debian 12+, Ubuntu 24.04+) | ✅ Supported | APT repository |
| Linux (AppImage) | ✅ Supported | Direct download |
| macOS | ⚡ Manual build | `cargo tauri build` |
| Windows | ⚡ Manual build | `cargo tauri build` |

## Install via APT (recommended)

### 1. Add the GPG key

```sh
sudo curl -fsSL https://graphwiz-ai.codeberg.page/debian-repo/.debian/world-office.gpg \
  -o /usr/share/keyrings/world-office.gpg
```

### 2. Add the APT source

```sh
echo "deb [signed-by=/usr/share/keyrings/world-office.gpg] \
  https://graphwiz-ai.codeberg.page/debian-repo/.debian stable main" \
  | sudo tee /etc/apt/sources.list.d/world-office.list
```

### 3. Install

```sh
sudo apt update
sudo apt install world-office
```

### 4. Launch

```sh
world-office
```

Or open from your desktop environment's application menu under **Office → World Office**.

## Install via AppImage

1. Download the latest `.AppImage` from the [releases page](https://codeberg.org/graphwiz-ai/world-office/releases)
2. Make executable: `chmod +x world-office-*.AppImage`
3. Run: `./world-office-*.AppImage`

## Verify Installation

```sh
world-office --version
# Expected output: world-office-desktop X.Y.Z
```

The main window should appear with the editor toolbar, status bar, and side panels.

## Updating

```sh
sudo apt update && sudo apt upgrade world-office
```

Updates are published automatically via CI when a new version tag (`v*`) is pushed.

## Uninstalling

```sh
sudo apt remove world-office
sudo rm /etc/apt/sources.list.d/world-office.list
sudo rm /usr/share/keyrings/world-office.gpg
```

## Build from Source

See the [Build Guide](./build-guide.md) for development and release build instructions.
