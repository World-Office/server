# @world-office/plugin-sdk

Plugin development SDK for [World Office](https://codeberg.org/World-Office).

This package provides TypeScript types, utilities, and tooling for creating plugins that extend World Office editors.

## What Plugins Can Do

World Office plugins can:

- **Add toolbar buttons** — Register buttons in the editor toolbar with custom click handlers
- **Add menu items** — Add items to existing menus (File, Edit, View, Tools, Help)
- **Add panels** — Create side panels or bottom panels with custom HTML content
- **Add translations** — Provide i18n translations for your plugin UI
- **Use storage** — Persist key-value data scoped to your plugin
- **Interact with the editor** — Get the current selection, insert content
- **Listen to editor events** — React to document changes and user actions

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 8 (recommended) or npm
- A World Office instance running locally or accessible via browser

## Installation

```sh
pnpm add @world-office/plugin-sdk
```

Or if using the CLI scaffolder:

```sh
npx create-wo-plugin my-plugin-name
```

## Getting Started

### Create a Plugin (Manual)

1. Create a new directory for your plugin:

```sh
mkdir my-plugin && cd my-plugin
```

2. Initialize a TypeScript project:

```sh
pnpm init
pnpm add @world-office/plugin-sdk
pnpm add -D typescript
```

3. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

4. Create `src/index.ts` with your plugin:

```typescript
import type { WorldOfficePlugin, PluginContext } from "@world-office/plugin-sdk"

const plugin: WorldOfficePlugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  description: "Does something useful",

  init(ctx: PluginContext) {
    ctx.toolbar.registerButton({
      id: "my-plugin-btn",
      label: "Do Something",
      icon: "zap",
      onClick: () => {
        console.log("Plugin button clicked!")
      },
    })
  },

  destroy() {
    // Cleanup resources here
  },
}

export default plugin
```

5. Create `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "main": "dist/index.js"
}
```

6. Build your plugin:

```sh
pnpm build
```

7. Open World Office, go to **Plugin Manager**, and load your plugin.

## Plugin API Reference

### WorldOfficePlugin

The main plugin interface. Every plugin must export a `WorldOfficePlugin` object as default.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier (kebab-case, e.g., `"word-count"`) |
| `name` | `string` | Yes | Human-readable display name |
| `version` | `string` | Yes | Semantic version (e.g., `"1.0.0"`) |
| `description` | `string` | No | Short description of what the plugin does |
| `init` | `(ctx: PluginContext) => void \| Promise<void>` | Yes | Called when the plugin is loaded |
| `destroy` | `() => void` | Yes | Called when the plugin is unloaded |

### PluginContext

The context object passed to `init()`. Provides access to all plugin APIs.

| Property | Type | Description |
|----------|------|-------------|
| `pluginId` | `string` | The plugin's unique ID |
| `toolbar` | `PluginToolbarAPI` | Toolbar registration API |
| `menu` | `PluginMenuAPI` | Menu registration API |
| `panel` | `PluginPanelAPI` | Panel registration API |
| `i18n` | `PluginI18nAPI` | Translation registration API |
| `storage` | `PluginStorageAPI` | Key-value storage API |
| `editor` | `PluginEditorAPI` | Editor interaction API |

### PluginToolbarAPI

| Method | Description |
|--------|-------------|
| `registerButton(config)` | Add a button to the toolbar |
| `registerTab(config)` | Add a tab to the toolbar |
| `unregisterButton(id)` | Remove a button by ID |
| `unregisterTab(id)` | Remove a tab by ID |

### PluginToolbarButtonConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Button identifier (scoped to plugin) |
| `label` | `string` | Yes | Display label |
| `icon` | `string` | No | Lucide icon name |
| `tooltip` | `string` | No | Tooltip text |
| `group` | `string` | No | Ribbon group to place the button in |
| `onClick` | `() => void` | Yes | Click handler |
| `toggleable` | `boolean` | No | Whether the button is a toggle |
| `toggled` | `boolean` | No | Current toggle state |

### PluginMenuAPI

| Method | Description |
|--------|-------------|
| `registerItem(config)` | Add a menu item |
| `unregisterItem(id)` | Remove a menu item by ID |

### PluginMenuItemConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Menu item identifier |
| `label` | `string` | Yes | Display label |
| `icon` | `string` | No | Optional icon |
| `onClick` | `() => void` | Yes | Click handler |
| `shortcut` | `string` | No | Keyboard shortcut hint |
| `disabled` | `boolean` | No | Whether the item is disabled |
| `children` | `PluginMenuItemConfig[]` | No | Nested submenu items |
| `separator` | `boolean` | No | Whether this is a separator |
| `menuPath` | `string` | No | Menu path (e.g., `"file/export"`) |

### PluginPanelAPI

| Method | Description |
|--------|-------------|
| `registerPanel(config)` | Add a panel |
| `unregisterPanel(id)` | Remove a panel by ID |

### PluginPanelConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Panel identifier |
| `title` | `string` | Yes | Display title |
| `icon` | `string` | No | Optional icon |
| `position` | `"left" \| "right" \| "bottom"` | No | Panel position (default: `"right"`) |
| `render` | `(container: HTMLElement) => void` | Yes | Render function |
| `destroy` | `() => void` | No | Cleanup function |

### PluginStorageAPI

| Method | Description |
|--------|-------------|
| `get(key)` | Get a stored value (returns `string \| null`) |
| `set(key, value)` | Store a value |
| `remove(key)` | Delete a stored value |

### PluginEditorAPI

| Method | Description |
|--------|-------------|
| `getSelection()` | Get the current editor selection |
| `insertContent(content)` | Insert content at the cursor position |

## Validation

You can validate your plugin object programmatically:

```typescript
import { validatePlugin } from "@world-office/plugin-sdk"
import myPlugin from "./src/index"

const result = validatePlugin(myPlugin)
if (!result.valid) {
  console.error("Plugin validation failed:", result.errors)
}
```

## Publishing

### Registering in the Plugin Marketplace

1. Ensure your plugin has a valid `manifest.json` with all required fields.
2. Build your plugin (produces `dist/` with compiled JS and type declarations).
3. Submit your plugin to the [World Office Plugin Registry](https://plugins.world-office.dev) (coming soon).
4. Once approved, your plugin will appear in the Plugin Marketplace in World Office.

### Distributing Manually

Alternatively, distribute your plugin as a package:

1. Publish to npm: `npm publish`
2. Users install it: `npm install your-plugin-name`
3. Users configure it in World Office Plugin Manager by pointing to the installed path.

## Examples

- [hello-world](./examples/hello-world/) — Minimal plugin demonstrating all API features

## License

AGPL-3.0-or-later
