# Contributing Plugins

Thank you for your interest in contributing a plugin to World Office!

## Plugin Guidelines

All plugins must follow these guidelines to be accepted into the plugin marketplace:

### Requirements

1. **Unique ID** — Your plugin's `id` must be unique across the marketplace. Use a prefix if needed (e.g., `mycompany-word-count`).

2. **Semantic Versioning** — Follow [semver](https://semver.org/) for version numbers.

3. **TypeScript** — Plugins should be written in TypeScript and include type declarations.

4. **manifest.json** — Every plugin must include a `manifest.json` at its root:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What my plugin does",
  "author": "Your Name",
  "license": "MIT",
  "main": "dist/index.js"
}
```

5. **Cleanup** — Plugins must clean up after themselves in the `destroy()` method (remove DOM nodes, event listeners, etc.).

6. **Error Handling** — Wrap initialization code in try/catch and handle errors gracefully.

### Best Practices

- Use the Lucide icon library for icons (see [lucide.dev](https://lucide.dev) for available icons).
- Keep your plugin focused on a single purpose.
- Test your plugin in multiple editor types (document, spreadsheet, presentation) when applicable.
- Use `ctx.storage` for persisting settings rather than global `localStorage`.
- Provide i18n translations via `ctx.i18n.addTranslations()`.

### Submission Process

1. Build and test your plugin thoroughly.
2. Publish your plugin source to a public repository.
3. Submit a pull request to the [World Office Plugin Registry](https://codeberg.org/World-Office/plugin-registry).
4. Include your `manifest.json`, built output, and source code in the submission.
5. The World Office team will review your plugin for security and compliance.

### Code of Conduct

All plugin contributors must follow the [World Office Code of Conduct](https://codeberg.org/World-Office/server/src/branch/main/CODE_OF_CONDUCT.md).

### Security

- Do not load external scripts or make network requests without user consent.
- Do not access browser APIs that could compromise user privacy without clear disclosure.
- All code is sandboxed in the plugin execution environment, but follow security best practices.
