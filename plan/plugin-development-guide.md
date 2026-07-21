# World Office Plugin Development Guide

**Version:** 1.0
**Date:** 2026-07-21
**SDK Package:** `@world-office/plugin-sdk` (TypeScript)

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Plugin Structure](#plugin-structure)
4. [Plugin Manifest](#plugin-manifest)
5. [Plugin API](#plugin-api)
6. [CLI Tools](#cli-tools)
7. [Example Plugin](#example-plugin)
8. [Best Practices](#best-practices)
9. [Publishing](#publishing)
10. [API Reference](#api-reference)

---

## Overview

World Office plugins are TypeScript modules that extend the editor functionality. Plugins can:

- Add toolbar buttons and tabs
- Add menu items
- Add sidebar panels
- Read and modify document content
- Store and load configuration
- Integrate with external services

The plugin SDK provides TypeScript types, a CLI scaffold tool, and a validator to help you build plugins.

---

## Quick Start

```bash
# Scaffold a new plugin
npx create-wo-plugin my-plugin

# Or manually
npm create wo-plugin my-plugin

# The scaffold creates:
#   my-plugin/
#   ├── package.json
#   ├── tsconfig.json
#   ├── src/
#   │   └── index.ts          # Plugin entry point
#   └── wo-plugin.json         # Plugin manifest
```

**Development workflow:**

```bash
cd my-plugin
npm install
npm run build    # Compile TypeScript → dist/
npm run validate # Validate manifest and structure
```

---

## Plugin Structure

```
my-plugin/
├── package.json          # npm package metadata
├── tsconfig.json         # TypeScript configuration
├── wo-plugin.json        # Plugin manifest (see below)
├── src/
│   ├── index.ts          # Plugin entry point — exports WorldOfficePlugin
│   └── ...               # Additional source files
├── dist/                 # Compiled output (published)
│   └── index.js
└── assets/               # Optional: icons, images
    └── icon.svg
```

### package.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My World Office plugin",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "wo-plugin.json", "assets"]
}
```

---

## Plugin Manifest

Every plugin requires a `wo-plugin.json` manifest:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Your Name",
  "license": "MIT",
  "homepage": "https://github.com/you/my-plugin",
  "icon": "wand",
  "main": "src/index.ts"
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (kebab-case, no spaces) |
| `name` | string | Yes | Human-readable display name |
| `version` | string | Yes | Semantic version (semver) |
| `description` | string | No | Short description shown in marketplace |
| `author` | string | No | Plugin author name |
| `license` | string | No | SPDX license identifier |
| `homepage` | string | No | Project homepage URL |
| `icon` | string | No | Lucide icon name (e.g. "wand", "search") |
| `main` | string | No | Entry point (default: `src/index.ts`) |

The manifest can be created programmatically:

```typescript
import { createPluginManifest } from "@world-office/plugin-sdk"

const manifest = createPluginManifest({
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  description: "Does something useful",
  author: "You",
})
```

---

## Plugin API

Plugins export a `WorldOfficePlugin` object that defines their capabilities:

```typescript
import type { WorldOfficePlugin, PluginContext } from "@world-office/plugin-sdk"

const myPlugin: WorldOfficePlugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",

  // Called when the plugin is loaded
  onInit(context: PluginContext) {
    // Register toolbar buttons, menu items, panels here
  },

  // Optional: toolbar contributions
  toolbar: {
    buttons: [
      {
        id: "my-button",
        label: "My Action",
        icon: "wand",
        onClick: (context: PluginContext) => {
          // Handle button click
        },
      },
    ],
  },

  // Optional: menu contributions
  menu: {
    items: [
      {
        id: "my-menu-item",
        label: "My Menu Item",
        onClick: (context: PluginContext) => {
          // Handle menu click
        },
      },
    ],
  },

  // Optional: sidebar panels
  panels: [
    {
      id: "my-panel",
      label: "My Panel",
      icon: "panel-left",
      component: MyPanelComponent,
    },
  ],
}

export default myPlugin
```

### PluginContext

The `PluginContext` provides access to editor APIs:

```typescript
interface PluginContext {
  /** Unique editor ID */
  editorId: string

  /** Editor type: "document" | "spreadsheet" | "presentation" | "pdf" | "visio" */
  editorType: string

  /** Current document content */
  editor: PluginEditorAPI

  /** Toolbar manipulation API */
  toolbar: PluginToolbarAPI

  /** Menu manipulation API */
  menu: PluginMenuAPI

  /** Panel management API */
  panels: PluginPanelAPI

  /** Persistent key-value storage (scoped to plugin) */
  storage: PluginStorageAPI

  /** Plugin-specific config/settings */
  settings: Record<string, unknown>
}
```

### Editor API

```typescript
interface PluginEditorAPI {
  /** Get current document content as plain text */
  getText(): string

  /** Get current document content as HTML */
  getHTML(): string

  /** Insert text at cursor position */
  insertText(text: string): void

  /** Get current cursor/selection position */
  getSelection(): PluginEditorSelection

  /** Execute a command on the editor */
  execCommand(command: string, args?: unknown): void
}
```

### Storage API

```typescript
interface PluginStorageAPI {
  /** Get a value by key */
  get(key: string): unknown

  /** Set a value by key */
  set(key: string, value: unknown): void

  /** Remove a key */
  remove(key: string): void

  /** Clear all plugin data */
  clear(): void
}
```

---

## CLI Tools

### create-wo-plugin

Scaffolds a new plugin project:

```bash
npx create-wo-plugin <plugin-name> [options]

Options:
  --template <name>   Template to use (default: "default")
  --typescript        Generate TypeScript project (default)
  --javascript        Generate JavaScript project
  --yes              Skip prompts, use defaults
```

### Plugin Validator

Validates your plugin structure:

```bash
npx wo-plugin validate [path]

# Checks:
# ✅ Manifest exists and is valid JSON
# ✅ All required fields present
# ✅ Entry point file exists
# ✅ package.json has correct structure
# ✅ Version follows semver
```

---

## Example Plugin

**File:** `packages/plugin-sdk/examples/hello-world/src/index.ts`

```typescript
import type { WorldOfficePlugin, PluginContext } from "@world-office/plugin-sdk"

export default {
  id: "hello-world",
  name: "Hello World",
  version: "1.0.0",
  description: "A simple demo plugin",

  onInit(context: PluginContext) {
    console.log(`Hello World plugin loaded in editor ${context.editorId}`)
  },

  toolbar: {
    buttons: [
      {
        id: "say-hello",
        label: "Say Hello",
        icon: "message-circle",
        onClick: (ctx: PluginContext) => {
          ctx.editor.insertText("Hello from plugin!")
        },
      },
    ],
  },
} satisfies WorldOfficePlugin
```

**Complete example available at:** `packages/plugin-sdk/examples/hello-world/`

---

## Best Practices

1. **Use TypeScript** — the SDK provides full type definitions
2. **Keep plugins focused** — one plugin = one feature
3. **Handle errors gracefully** — wrap logic in try/catch
4. **Use storage for state** — don't rely on global variables
5. **Version responsibly** — follow semver for breaking changes
6. **Test on all editor types** — some APIs may differ between editors
7. **Minimize dependencies** — plugins should be self-contained
8. **Follow the manifest schema** — validation will catch mistakes

---

## Publishing

### Local Installation

```bash
# Copy plugin directory to
~/.world-office/plugins/my-plugin/

# Or link via symlink
ln -s /path/to/my-plugin ~/.world-office/plugins/
```

### npm Registry

Plugins can be distributed via npm:

```bash
npm publish

# Users install with:
npm install -g my-world-office-plugin
```

### Marketplace (Future)

Plugins published to npm with the keyword `world-office-plugin` will appear in the plugin marketplace (coming soon).

---

## API Reference

### Exported Types

```typescript
// From @world-office/plugin-sdk
export type { WorldOfficePlugin }
export type { PluginContext }
export type { PluginToolbarAPI }
export type { PluginMenuAPI }
export type { PluginPanelAPI }
export type { PluginStorageAPI }
export type { PluginEditorAPI }
export type { PluginToolbarButtonConfig }
export type { PluginToolbarTabConfig }
export type { PluginMenuItemConfig }
export type { PluginPanelConfig }
export type { PluginEditorSelection }
export type { PluginStatus }
export type { PluginRegistryEntry }
export type { PluginManifest }
export type { ValidationResult }
```

### Exported Functions

```typescript
// From @world-office/plugin-sdk
export { createPluginManifest }   // Create manifest object
export { validatePlugin }         // Validate plugin structure
export { scaffoldPlugin }        // Scaffold new plugin project
export { createPluginContext }    // Create plugin runtime context
export { getPluginAPI }          // Get plugin API instance
export { sandboxExecutePlugin }  // Execute plugin in sandbox
export { loadPluginConfig }      // Load plugin configuration
export { savePluginConfig }      // Save plugin configuration
export { getPluginSettings }     // Get plugin settings
export { updatePluginSettings }  // Update plugin settings
export { togglePluginEnabled }   // Toggle plugin enabled state
export { PluginLoader }          // Plugin loader class
export { pluginLoader }          // Plugin loader singleton
```

### Plugin Registry

The `PluginLoader` singleton manages all loaded plugins:

```typescript
import { pluginLoader } from "@world-office/plugin-sdk"

// Register a plugin
pluginLoader.register(myPlugin)

// Get all registered plugins
const plugins = pluginLoader.getAll()

// Enable/disable a plugin
pluginLoader.setEnabled("my-plugin", true)

// Get plugin status
const status = pluginLoader.getStatus("my-plugin")
// "active" | "inactive" | "error"
```
