# World Office Desktop — Plugin Development Guide

## Overview

Plugins are plain JavaScript files executed in a sandboxed scope inside the editor webview. Each plugin receives an `api` object with a limited set of capabilities.

## Quick Start

Create a file `~/.config/world-office/plugins/hello-world.js`:

```js
api.ui.showToast("Hello from World Office!");
```

Launch (or reload) the editor. You should see `[Plugin] Hello from World Office!` in the console.

## Plugin API Reference

### `api.toolbar.addButton(config)`

Register a button in the editor toolbar.

```js
api.toolbar.addButton({
  id: "my-button",
  label: "My Button",
  icon: "★",
  onClick: () => {
    api.ui.showToast("Button clicked!");
  },
});
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the button |
| `label` | `string` | Yes | Text label displayed on the button |
| `icon` | `string` | No | Emoji or icon character |
| `onClick` | `() => void` | Yes | Callback when button is clicked |

The button is registered via a custom DOM event. The toolbar integration listens for `plugin-add-button` events and renders the button.

### `api.editor.on(event, callback)`

Subscribe to editor events.

```js
const unsubscribe = api.editor.on("document-saved", (data) => {
  api.ui.showToast("Document saved!");
});
```

**Returns:** a cleanup function — call it to unsubscribe.

**Available events:** (planned) `document-saved`, `selection-changed`, `cursor-moved`

### `api.editor.getDocument()`

Get a reference to the current document object. Currently returns an empty object — document access API is under development.

### `api.ui.showToast(message)`

Show a toast notification in the console.

```js
api.ui.showToast("Operation complete");
```

## Example Plugins

### Word Counter

```js
// ~/.config/world-office/plugins/word-count.js
api.toolbar.addButton({
  id: "word-count",
  label: "Word Count",
  icon: "📝",
  onClick: () => {
    // This will be expanded when document API is available
    api.ui.showToast("Word count plugin active");
  },
});
```

### Theme Toggle

```js
// ~/.config/world-office/plugins/theme-toggle.js
let darkMode = false;

api.toolbar.addButton({
  id: "theme-toggle",
  label: "Toggle Theme",
  icon: "🌓",
  onClick: () => {
    darkMode = !darkMode;
    document.body.style.background = darkMode ? "#1e1e1e" : "#f5f5f5";
    document.body.style.color = darkMode ? "#e0e0e0" : "#222";
    api.ui.showToast(darkMode ? "Dark mode" : "Light mode");
  },
});
```

## Security

- Plugins execute in a sandboxed `new Function("api", source)` scope — they cannot access `window`, `document`, or any global objects except through the `api` parameter
- No filesystem access, no network access, no DOM access beyond what the API exposes
- Plugins are loaded from a user-controlled directory (`~/.config/world-office/plugins/`), so the trust model is that the user controls what runs
- There is no plugin registry, no auto-install from external sources

## Limitations (Current)

- Plugins run once on editor load — hot reload is not yet supported (requires page refresh)
- The `api.editor.getDocument()` and `api.editor.on()` methods have limited functionality — full document access is planned
- No plugin marketplace or package manager
- No built-in editor for plugin files — use your preferred text editor

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Plugin not loaded | File is not `.js` | Rename to `.js` extension |
| Console error `Plugin ... not found` | File in wrong directory | Move to `~/.config/world-office/plugins/` |
| Plugin runs but no visible effect | API limitation | Check the console for execution errors |
| `api` is undefined | Plugin source syntax error | Validate JS syntax with `node -e "eval(require('fs').readFileSync('plugin.js','utf8'))"` |
