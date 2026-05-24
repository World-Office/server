# Desktop Build Guide

## Prerequisites

- Rust nightly toolchain (see root `rust-toolchain.toml`)
- Node.js 20+ and pnpm 10
- Tauri system dependencies:
  - **Linux:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Visual Studio Build Tools + WebView2 SDK

## Development Build

```bash
cd server
pnpm install
cd desktop/tauri-poc
pnpm run build:web   # Build web frontend
pnpm tauri dev       # Run in development mode
```

## Release Build

```bash
cd server
pnpm install
cd desktop/tauri-poc
pnpm run build:web
pnpm tauri build     # Produces .deb, .AppImage (Linux)
```

Artifacts appear in `src-tauri/target/release/bundle/`.

## CI Build

On push of tag `v*`, the Forgejo Actions workflow in `.forgejo/workflows/desktop-release.yml`:
1. Builds the Tauri app in a Docker container
2. Signs the .deb with the repository GPG key
3. Publishes to the Codeberg Pages Debian repo
4. Creates a Forgejo release with attached artifacts

## Manual macOS/Windows Build

```bash
# Any platform with Tauri system deps installed:
cd desktop/tauri-poc
pnpm tauri build
```

macOS/Windows builds are not yet in CI (requires self-hosted runners). Build locally and sign manually.

## Debian Repository Install

```sh
# One-time setup
sudo curl -fsSL https://world-office.codeberg.page/debian/world-office.gpg \
  -o /usr/share/keyrings/world-office.gpg

echo "deb [signed-by=/usr/share/keyrings/world-office.gpg] \
  https://world-office.codeberg.page/debian stable main" \
  | sudo tee /etc/apt/sources.list.d/world-office.list

# Install
sudo apt update && sudo apt install world-office
```

## Release Checklist

1. Update version in `desktop/tauri-poc/src-tauri/Cargo.toml` and `package.json`
2. Update `CHANGELOG.md`
3. Commit: `chore: bump version to X.Y.Z`
4. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. CI builds and publishes automatically
6. Verify: `apt update && apt install world-office` from a clean Debian VM
