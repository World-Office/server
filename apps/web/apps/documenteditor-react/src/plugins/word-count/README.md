# Word Count Plugin — Example

A sample World Office plugin that registers a "Word Count" button in the toolbar.

## How to Write a Plugin

### 1. Create the plugin module

Create a directory with an `index.ts` file:

```
plugins/my-plugin/
  index.ts
```

### 2. Implement WorldOfficePlugin

```typescript
import type { WorldOfficePlugin, PluginContext } from "@world-office/editor-common"

const myPlugin: WorldOfficePlugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  description: "What my plugin does",

  init(ctx: PluginContext) {
    // Register toolbar buttons:
    ctx.toolbar.registerButton({
      id: "my-button",
      label: "My Button",
      icon: "Star",
      onClick: () => {
        console.log("Button clicked!")
      },
    })

    // Register menu items:
    ctx.menu.registerItem({
      id: "my-menu-item",
      label: "My Menu Item",
      onClick: () => {},
    })

    // Register a side panel:
    ctx.panel.registerPanel({
      id: "my-panel",
      title: "My Panel",
      position: "right",
      render: (container) => {
        container.innerHTML = "<p>Hello from plugin!</p>"
      },
    })

    // Add translations:
    ctx.i18n.addTranslations("fr", { "my.key": "Ma valeur" })

    // Use storage:
    ctx.storage.set("pref", "dark")
    const pref = ctx.storage.get("pref")

    // Use editor API:
    const sel = ctx.editor.getSelection()
    ctx.editor.insertContent("Inserted text")
  },

  destroy() {
    // Cleanup resources
  },
}

export default myPlugin
```

### 3. Configure the plugin

Add the plugin to your config (stored in `localStorage` under key `wo-plugins`):

```json
[
  {
    "id": "my-plugin",
    "name": "My Plugin",
    "enabled": true,
    "path": "/path/to/plugins/my-plugin/index.ts"
  }
]
```

### API Reference

| Context Property | Methods |
|-----------------|---------|
| `ctx.toolbar` | `registerButton(config)`, `registerTab(config)`, `unregisterButton(id)`, `unregisterTab(id)` |
| `ctx.menu` | `registerItem(config)`, `unregisterItem(id)` |
| `ctx.panel` | `registerPanel(config)`, `unregisterPanel(id)` |
| `ctx.i18n` | `addTranslations(locale, translations)` |
| `ctx.storage` | `get(key)`, `set(key, value)`, `remove(key)` |
| `ctx.editor` | `getSelection()`, `insertContent(content)` |
