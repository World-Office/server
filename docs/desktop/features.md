# World Office Desktop — Features Guide

## Settings Window

Open settings from the **File → Settings** menu item.

The settings window has four tabs:

| Tab | Settings |
|-----|----------|
| **General** | Data directory, language, auto-start at login |
| **Editor** | Default format (DOCX/ODT/TXT), autosave interval, spellcheck toggle |
| **Network** | Server URL, proxy URL |
| **Appearance** | Theme (System/Light/Dark), font size, toolbar layout |

### Managing settings

- **Save** — persist changes immediately
- **Cancel** — revert to previously saved state and close
- **Reset to Defaults** — restore all factory defaults

Settings are persisted to `~/.local/share/WorldOffice/settings.json` (Linux) or the platform equivalent. They survive app restarts.

## Offline Mode

When the backend service (coauthoring service on port 8004) is unreachable, an **Offline** badge appears in the top-right corner of the editor.

The badge is visible when:
1. Your machine has no network connectivity (`navigator.onLine === false`)
2. The coauthoring service at `127.0.0.1:8004` is not responding

The badge disappears automatically when connectivity is restored. The health check runs every 10 seconds.

Offline mode is read-only — document editing is available but collaboration features (presence, cursor sharing) will not function until the backend is reachable again.

## Plugin System

World Office supports user-installed JavaScript plugins.

### Plugin Directory

Plugins are loaded from `~/.config/world-office/plugins/` (Linux) or the platform equivalent. Each plugin is a single `.js` file:

```
~/.config/world-office/plugins/
├── hello-world.js
├── word-count.js
└── dark-theme-toggle.js
```

### How Plugins Work

1. On app launch (or when the editor window loads), Rust scans the plugin directory
2. Each `.js` file is loaded, and its source is sent to the frontend
3. The frontend executes the plugin source in a sandboxed function scope with a limited API object
4. Plugins can register toolbar buttons, listen to editor events, and show toast notifications

### Writing a Plugin

See the [Plugin Development Guide](./plugin-dev.md) for the full API reference and examples.

### Managing Plugins

- **Add a plugin:** Place a `.js` file in the plugin directory
- **Remove a plugin:** Delete the `.js` file
- **Enable/disable:** Plugin enable/disable toggle is planned for the settings UI
